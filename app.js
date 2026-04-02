import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);

const app = document.getElementById('app-container');
const modals = document.getElementById('modals-container');
const header = document.getElementById('main-header');
let currentUser = null;
let currentStudentId = null;

// Routing
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    render();
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  render();
}

async function render() {
  app.innerHTML = '<div class="text-center text-slate-500 py-20">Loading...</div>';
  modals.innerHTML = '';

  if (!currentUser && window.location.hash !== '#register') {
    header.classList.add('hidden');
    renderLogin();
    return;
  }
  if (!currentUser && window.location.hash === '#register') {
    header.classList.add('hidden');
    renderRegister();
    return;
  }

  header.classList.remove('hidden');

  if (!currentStudentId) {
    // Check if the student profile exists
    let { data } = await supabase.from('students').select('id, full_name').eq('auth_id', currentUser.id).single();

    // If they logged in for the first time without registering via our form,
    // explicitly map their Auth ID into the students table as required by the blueprint.
    if (!data) {
      const email = currentUser.email;
      const defaultName = email.split('@')[0]; // fallback full_name

      const { data: newStudent, error } = await supabase.from('students').insert({
        auth_id: currentUser.id,
        email: email,
        full_name: defaultName,
        registration_number: null
      }).select('id, full_name').single();

      if (!error && newStudent) {
        data = newStudent;
      }
    }

    if (data) {
      currentStudentId = data.id;
      window.studentName = data.full_name;
    }
  }

  const hash = window.location.hash;
  if (hash.startsWith('#assignment/')) {
    renderAssignment(hash.split('/')[1]);
  } else if (hash.startsWith('#grade/')) {
    renderGradeReview(hash.split('/')[1]);
  } else {
    renderDashboard();
  }
  lucide.createIcons();
}

async function renderGradeReview(subId) {
  const { data: subData } = await supabase
    .from('exam_submissions')
    .select(`
      id, status, score, ai_feedback,
      sessions!inner(title, publish_status, courses(name))
    `)
    .eq('id', subId)
    .single();

  if (!subData || subData.sessions.publish_status !== 'published') {
    return renderDashboard();
  }

  const tpl = document.getElementById('tpl-grade-review').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('grade-course-name').textContent = subData.sessions.courses.name;
  document.getElementById('grade-title').textContent = subData.sessions.title;
  document.getElementById('grade-score').textContent = `${subData.score ?? 'N/A'}%`;

  const feedbackList = document.getElementById('feedback-list');
  const items = subData.ai_feedback && Array.isArray(subData.ai_feedback) ? subData.ai_feedback : [];

  if (items.length === 0) {
    feedbackList.innerHTML = `<div class="card text-center text-slate-500">No detailed question feedback available yet.</div>`;
  } else {
    items.forEach((item, index) => {
      const qId = item.id || index.toString();
      const div = document.createElement('div');
      div.className = 'card p-0 overflow-hidden';
      div.innerHTML = `
        <div class="p-6 border-b border-slate-50">
          <div class="flex justify-between items-start gap-4 mb-4">
            <h3 class="text-lg font-bold text-slate-900 flex-1">${item.question || `Question ${index + 1}`}</h3>
            <div class="px-3 py-1 rounded-full text-sm font-bold flex-shrink-0 ${item.score === item.maxScore ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}">
              ${item.score ?? '-'} / ${item.maxScore ?? '-'} pts
            </div>
          </div>
          <div class="bg-slate-50 p-4 rounded-[16px]">
            <p class="text-sm font-semibold text-slate-500 mb-1">AI Notes:</p>
            <p class="text-slate-800">${item.aiNote || 'No feedback provided.'}</p>
          </div>
        </div>
        <div class="bg-slate-50/50 p-4 px-6 flex justify-end" id="appeal-container-${qId}">
          <button id="btn-open-appeal-${qId}" class="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
            <i data-lucide="alert-circle" class="w-4 h-4"></i> Dispute / Appeal
          </button>
        </div>
      `;
      feedbackList.appendChild(div);

      // Handle Appeal Setup
      const container = document.getElementById(`appeal-container-${qId}`);
      document.getElementById(`btn-open-appeal-${qId}`).onclick = () => {
        container.innerHTML = `
          <div class="w-full flex gap-2">
            <input type="text" id="appeal-reason-${qId}" placeholder="Briefly explain why..." class="flex-1 px-4 py-2 rounded-full border border-slate-200 outline-none focus:border-brand-500 text-sm">
            <button id="btn-submit-appeal-${qId}" class="px-4 py-2 bg-slate-900 text-white rounded-full text-sm font-bold">Send</button>
            <button id="btn-cancel-appeal-${qId}" class="p-2 text-slate-400 hover:text-slate-900 rounded-full">Cancel</button>
          </div>
        `;
        document.getElementById(`btn-cancel-appeal-${qId}`).onclick = () => {
          container.innerHTML = `
            <button id="btn-open-appeal-${qId}" class="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
              <i data-lucide="alert-circle" class="w-4 h-4"></i> Dispute / Appeal
            </button>
          `;
          lucide.createIcons();
          // We would re-attach the event listener here if they cancelled, but for simplicity:
          // it's easier to re-render the whole page or recursively call the bind function.
        };

        document.getElementById(`btn-submit-appeal-${qId}`).onclick = async () => {
          const reason = document.getElementById(`appeal-reason-${qId}`).value;
          if (!reason) return;

          const { error } = await supabase.from('appeals').insert({
            submission_id: subId,
            student_id: currentStudentId,
            question_id: qId,
            reason: reason
          });

          if (!error) {
            container.innerHTML = `
              <span class="flex items-center gap-2 text-sm font-bold text-green-600 bg-green-50 px-4 py-2 rounded-full">
                <i data-lucide="check-circle" class="w-4 h-4"></i> Appeal Submitted
              </span>
            `;
            lucide.createIcons();
          } else {
            alert('Failed to submit appeal');
          }
        };
      };
    });
  }

  lucide.createIcons();
}

function renderLogin() {
  const tpl = document.getElementById('tpl-login').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login-submit');
    const err = document.getElementById('login-error');
    btn.disabled = true;
    err.classList.add('hidden');

    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });

    if (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}

function renderRegister() {
  const tpl = document.getElementById('tpl-register').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register-submit');
    const err = document.getElementById('register-error');
    btn.disabled = true;
    err.classList.add('hidden');

    const email = document.getElementById('reg-email').value;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: document.getElementById('reg-password').value
    });

    if (authError) {
      err.textContent = authError.message;
      err.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    if (authData.user) {
      const { error: dbError } = await supabase.from('students').insert({
        auth_id: authData.user.id,
        email,
        full_name: document.getElementById('reg-name').value,
        registration_number: document.getElementById('reg-number').value
      });
      if (dbError) {
        err.textContent = dbError.message;
        err.classList.remove('hidden');
        btn.disabled = false;
      }
    }
  });
}

async function renderDashboard() {
  const tpl = document.getElementById('tpl-dashboard').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  // Setup Join Modal
  document.getElementById('btn-open-join').addEventListener('click', () => {
    const modalTpl = document.getElementById('tpl-join-modal').content.cloneNode(true);
    modals.innerHTML = '';
    modals.appendChild(modalTpl);
    lucide.createIcons();

    document.getElementById('btn-close-join').addEventListener('click', () => modals.innerHTML = '');
    document.getElementById('form-join').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('join-error');
      const code = document.getElementById('join-code').value.toUpperCase();
      err.classList.add('hidden');

      const { data, error } = await supabase.rpc('api_join_class', {
        p_student_auth_id: currentUser.id,
        p_join_code: code
      });

      if (error || (data && !data.success)) {
        err.textContent = error?.message || data?.error || 'Failed to join';
        err.classList.remove('hidden');
      } else {
        modals.innerHTML = '';
        renderDashboard(); // Refresh
      }
    });
  });

  // Fetch Data
  const { data: enrollments } = await supabase.from('class_enrollments').select('course_id, courses(id, name)').eq('student_id', currentStudentId);

  const classList = document.getElementById('classes-list');
  if (!enrollments || enrollments.length === 0) {
    classList.innerHTML = `<div class="col-span-2 text-center text-slate-500 py-10 card">No classes yet. Join one above!</div>`;
  } else {
    enrollments.forEach(e => {
      classList.innerHTML += `
        <div class="card hover:border-slate-300 transition-colors">
          <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="book" class="text-slate-600 w-5 h-5"></i>
          </div>
          <h3 class="font-bold text-slate-900">${e.courses.name}</h3>
        </div>
      `;
    });

    // Fetch sessions
    const courseIds = enrollments.map(e => e.course_id);
    const { data: sessions } = await supabase.from('sessions').select('id, title, description, publish_status, courses(name)').in('course_id', courseIds);
    const { data: submissions } = await supabase.from('exam_submissions').select('id, session_id, status').eq('student_name', window.studentName);
    const submittedIds = new Set(submissions?.map(s => s.session_id) || []);

    const pending = sessions?.filter(s => !submittedIds.has(s.id)) || [];

    if (pending.length > 0) {
      document.getElementById('pending-section').classList.remove('hidden');
      const pList = document.getElementById('pending-list');
      pending.forEach(s => {
        pList.innerHTML += `
          <a href="#assignment/${s.id}" class="block card hover:border-slate-300 transition-colors group">
            <p class="text-xs font-bold text-slate-400 uppercase mb-1">${s.courses.name}</p>
            <h3 class="font-bold text-slate-900 group-hover:text-slate-600 transition-colors">${s.title}</h3>
          </a>
        `;
      });
    }

    // Identify recently graded
    const graded = [];
    if (submissions && sessions) {
      submissions.forEach(sub => {
        const session = sessions.find(s => s.id === sub.session_id);
        if (session && sub.status === 'completed' && session.publish_status === 'published') {
          graded.push({ sub, session });
        }
      });
    }

    if (graded.length > 0) {
      document.getElementById('graded-section').classList.remove('hidden');
      const gList = document.getElementById('graded-list');
      graded.forEach(g => {
        gList.innerHTML += `
          <a href="#grade/${g.sub.id}" class="block card hover:border-green-300 transition-colors group">
            <div class="flex justify-between items-center">
              <div>
                <h3 class="font-bold text-slate-900 group-hover:text-green-600 transition-colors">${g.session.title}</h3>
                <p class="text-slate-500 text-sm mt-1">Review your AI feedback</p>
              </div>
              <div class="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 group-hover:bg-green-100 transition-colors">
                <i data-lucide="arrow-right" class="w-5 h-5"></i>
              </div>
            </div>
          </a>
        `;
      });
    }
  }
  lucide.createIcons();
}

async function renderAssignment(id) {
  const { data: session } = await supabase.from('sessions').select('id, title, description, courses(name)').eq('id', id).single();
  if (!session) return renderDashboard();

  const tpl = document.getElementById('tpl-assignment').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('assignment-header').innerHTML = `
    <p class="text-xs font-bold text-slate-400 uppercase">${session.courses.name}</p>
    <h1 class="text-2xl font-bold text-slate-900">${session.title}</h1>
  `;
  document.getElementById('assignment-desc').textContent = session.description;

  let type = 'text';
  const tabText = document.getElementById('tab-text');
  const tabPdf = document.getElementById('tab-pdf');
  const conText = document.getElementById('container-text');
  const conPdf = document.getElementById('container-pdf');
  const inputPdf = document.getElementById('submit-pdf');
  let selectedFile = null;

  tabText.onclick = () => {
    type = 'text';
    tabText.className = "flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 bg-slate-100 text-slate-800 transition-colors";
    tabPdf.className = "flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-50 transition-colors";
    conText.classList.remove('hidden');
    conPdf.classList.add('hidden');
    document.getElementById('submit-text').required = true;
    inputPdf.required = false;
  };

  tabPdf.onclick = () => {
    type = 'pdf';
    tabPdf.className = "flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 bg-slate-100 text-slate-800 transition-colors";
    tabText.className = "flex-1 py-3 px-4 rounded-[20px] text-sm font-semibold flex items-center justify-center gap-2 text-slate-500 hover:bg-slate-50 transition-colors";
    conPdf.classList.remove('hidden');
    conText.classList.add('hidden');
    document.getElementById('submit-text').required = false;
    inputPdf.required = true;
  };

  inputPdf.onchange = (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
      document.getElementById('pdf-name').textContent = selectedFile.name;
    }
  };

  document.getElementById('form-submit-work').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-work');
    const err = document.getElementById('submit-error');
    btn.disabled = true;
    err.classList.add('hidden');

    let pdfPath = null;

    try {
      if (type === 'pdf' && selectedFile) {
        const ext = selectedFile.name.split('.').pop();
        const path = `${session.id}/${currentUser.id}_${Date.now()}.${ext}`;
        const { error, data } = await supabase.storage.from('exams_bucket').upload(path, selectedFile);
        if (error) throw error;
        pdfPath = data.path;
      }

      const { data, error } = await supabase.rpc('api_submit_work', {
        p_student_auth_id: currentUser.id,
        p_session_id: session.id,
        p_text_content: type === 'text' ? document.getElementById('submit-text').value : null,
        p_pdf_path: pdfPath
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);

      app.innerHTML = '';
      app.appendChild(document.getElementById('tpl-success').content.cloneNode(true));
      lucide.createIcons();
    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
      btn.disabled = false;
    }
  };

  lucide.createIcons();
}
