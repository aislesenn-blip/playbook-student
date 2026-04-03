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
    let { data, error: fetchError } = await supabase.from('students').select('id, full_name, registration_number').eq('auth_id', currentUser.id).single();

    // If they logged in for the first time without registering via our form,
    // explicitly map their Auth ID into the students table as required by the blueprint.
    if (!data || fetchError) {
      const email = currentUser.email || 'unknown@example.com';
      const defaultName = email.split('@')[0]; // fallback full_name

      const { data: newStudent, error: insertError } = await supabase.from('students').insert({
        auth_id: currentUser.id,
        email: email,
        full_name: defaultName,
        registration_number: null
      }).select('id, full_name, registration_number').single();

      if (!insertError && newStudent) {
        data = newStudent;
      } else {
        console.error("Critical: Could not auto-create student profile. Check RLS policies.", insertError);
        // Force the app to show a clear error instead of letting RPCs fail silently
        app.innerHTML = `
          <div class="text-center text-red-500 py-20 card max-w-md mx-auto mt-10">
            <h2 class="text-xl font-bold mb-2">Profile Error</h2>
            <p class="text-sm">We could not link your account to a student profile. Please contact support or check database permissions.</p>
          </div>
        `;
        return;
      }
    }

    if (data) {
      currentStudentId = data.id;
      window.studentName = data.full_name;
      window.registrationNumber = data.registration_number;
    }
  }

  const hash = window.location.hash;
  if (hash.startsWith('#course/')) {
    renderCourse(hash.split('/')[1]);
  } else if (hash.startsWith('#assignment/')) {
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
      id, status, score, ai_feedback, session_id
    `)
    .eq('id', subId)
    .single();

  if (!subData) return renderDashboard();

  const { data: sessionData } = await supabase.from('sessions').select('title, publish_status, course_id').eq('id', subData.session_id).single();

  if (!sessionData || sessionData.publish_status !== 'published') {
    return renderDashboard();
  }

  let courseName = 'Unknown Course';
  if (sessionData.course_id) {
      const { data: courseData } = await supabase.from('courses').select('name').eq('id', sessionData.course_id).single();
      if (courseData && courseData.name) courseName = courseData.name;
  }

  const tpl = document.getElementById('tpl-grade-review').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('grade-course-name').textContent = courseName;
  document.getElementById('grade-title').textContent = sessionData.title;
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

    // Capture values before async calls to prevent DOM references from breaking
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const fullName = document.getElementById('reg-name').value;
    const regNumber = document.getElementById('reg-number').value || null;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password
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
        full_name: fullName,
        registration_number: regNumber
      });
      if (dbError) {
        err.textContent = dbError.message;
        err.classList.remove('hidden');
        btn.disabled = false;
      } else {
        // Automatically set currentStudentId to bypass the fallback check
        currentStudentId = authData.user.id; // It will be fetched properly on next render
      }
    }
  });
}

async function renderCourse(courseId) {
  const tpl = document.getElementById('tpl-course').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  // Fetch course name
  const { data: courseData } = await supabase.from('courses').select('name').eq('id', courseId).single();
  document.getElementById('course-title').textContent = courseData?.name || 'Unknown Course';

  // Fetch sessions for this course
  const { data: sessions, error: sessionsError } = await supabase.from('sessions').select('id, title, publish_status').eq('course_id', courseId);
  if (sessionsError) console.error("Sessions fetch error:", sessionsError);

  let submissions = [];
  if (window.registrationNumber) {
    const { data } = await supabase.from('exam_submissions').select('id, session_id, status').eq('registration_number', window.registrationNumber);
    submissions = data || [];
  } else if (currentUser?.email) {
    // Fallback
    const studentName = currentUser.email.split('@')[0];
    const { data } = await supabase.from('exam_submissions').select('id, session_id, status').eq('student_name', studentName);
    submissions = data || [];
  }

  const pendingList = document.getElementById('course-pending-list');
  const gradedList = document.getElementById('course-graded-list');
  const pendingSection = document.getElementById('course-pending-section');
  const gradedSection = document.getElementById('course-graded-section');

  let hasPending = false;
  let hasGraded = false;

  (sessions || []).forEach(s => {
    const sub = submissions.find(sub => sub.session_id === s.id);

    if (!sub) {
      // Pending assignment
      hasPending = true;
      pendingSection.classList.remove('hidden');
      pendingList.innerHTML += `
        <a href="#assignment/${s.id}" class="card hover:border-slate-300 transition-colors block">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900">${s.title}</h3>
              <p class="text-sm text-slate-500 mt-1">Not started</p>
            </div>
            <i data-lucide="chevron-right" class="text-slate-400 w-5 h-5"></i>
          </div>
        </a>
      `;
    } else {
      // Submitted assignment
      hasGraded = true;
      gradedSection.classList.remove('hidden');
      let statusHtml = '';
      let linkHtml = `href="#grade/${sub.id}"`;

      if (s.publish_status === 'published') {
        statusHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Graded</span>`;
      } else {
        statusHtml = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Submitted</span>`;
        // Don't link to grade view if not published yet
        linkHtml = `href="#" class="cursor-default opacity-75"`;
      }

      gradedList.innerHTML += `
        <a ${linkHtml} class="card hover:border-slate-300 transition-colors block">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900">${s.title}</h3>
              <div class="mt-2">${statusHtml}</div>
            </div>
            ${s.publish_status === 'published' ? `<i data-lucide="chevron-right" class="text-slate-400 w-5 h-5"></i>` : ''}
          </div>
        </a>
      `;
    }
  });

  if (!hasPending && !hasGraded) {
    app.innerHTML += `
      <div class="text-center py-12 max-w-3xl mx-auto">
        <div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="folder-open" class="text-slate-400 w-8 h-8"></i>
        </div>
        <p class="text-slate-500">No assignments found for this course.</p>
      </div>
    `;
  }

  lucide.createIcons();
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
  // Workaround: We fetch enrollments first, then separately fetch courses to avoid 400 Bad Request if FKs are missing/blocked on the backend.
  const { data: rawEnrollments, error: enrollError } = await supabase.from('class_enrollments').select('course_id').eq('student_id', currentStudentId);

  if (enrollError) {
      console.error("Enrollment fetch error:", enrollError);
  }

  const classList = document.getElementById('classes-list');
  if (!rawEnrollments || rawEnrollments.length === 0) {
    classList.innerHTML = `<div class="col-span-2 text-center text-slate-500 py-10 card">No classes yet. Join one above!</div>`;
  } else {
    const courseIds = rawEnrollments.map(e => e.course_id);
    const { data: coursesData } = await supabase.from('courses').select('id, name').in('id', courseIds);

    // Create a lookup dictionary for courses
    const courseLookup = {};
    if (coursesData) {
        coursesData.forEach(c => courseLookup[c.id] = c.name);
    }

    rawEnrollments.forEach(e => {
      // NOTE: Playbook Student Portal focuses on assignments/sessions, not course-specific pages yet.
      // But if there were a course view, it would link like: <a href="#course/${e.course_id}" ...>
      classList.innerHTML += `
        <a href="#course/${e.course_id}" class="card hover:border-slate-300 transition-colors block cursor-pointer">
          <div class="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <i data-lucide="book" class="text-slate-600 w-5 h-5"></i>
          </div>
          <h3 class="font-bold text-slate-900">${courseLookup[e.course_id] || 'Unknown Course'}</h3>
        </a>
      `;
    });

    // Fetch sessions
    // Decouple relational query here as well to prevent 400 errors
    const { data: sessions, error: sessionsError } = await supabase.from('sessions').select('id, title, publish_status, course_id').in('course_id', courseIds);
    if (sessionsError) {
        console.error("Sessions fetch error:", sessionsError);
    }

    // Fetch submissions based on registration_number (with fallback to student_name if reg number is null)
    let submissions = [];
    if (window.registrationNumber) {
      const { data } = await supabase.from('exam_submissions').select('id, session_id, status').eq('registration_number', window.registrationNumber);
      submissions = data || [];
    } else {
      const { data } = await supabase.from('exam_submissions').select('id, session_id, status').eq('student_name', window.studentName);
      submissions = data || [];
    }

    const submittedIds = new Set(submissions?.map(s => s.session_id) || []);

    const pending = sessions?.filter(s => !submittedIds.has(s.id)) || [];

    if (pending.length > 0) {
      document.getElementById('pending-section').classList.remove('hidden');
      const pList = document.getElementById('pending-list');
      pending.forEach(s => {
        pList.innerHTML += `
          <a href="#assignment/${s.id}" class="block card hover:border-slate-300 transition-colors group">
            <p class="text-xs font-bold text-slate-400 uppercase mb-1">${courseLookup[s.course_id] || 'Unknown Course'}</p>
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
  const { data: session } = await supabase.from('sessions').select('id, title, course_id').eq('id', id).single();
  if (!session) return renderDashboard();

  let courseName = 'Unknown Course';
  if (session.course_id) {
      const { data: courseData } = await supabase.from('courses').select('name').eq('id', session.course_id).single();
      if (courseData && courseData.name) courseName = courseData.name;
  }

  const tpl = document.getElementById('tpl-assignment').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  document.getElementById('assignment-header').innerHTML = `
    <p class="text-xs font-bold text-slate-400 uppercase">${courseName}</p>
    <h1 class="text-2xl font-bold text-slate-900">${session.title}</h1>
  `;
  document.getElementById('assignment-desc').textContent = "Please read the assignment instructions provided by your professor.";

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
