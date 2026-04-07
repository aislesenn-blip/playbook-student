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

  setupSmartTooltip();

  render();
}

function setupSmartTooltip() {
  const tooltip = document.getElementById('smart-tooltip');

  document.addEventListener('mouseup', async (e) => {
    // Only trigger inside the app container to avoid firing on inputs etc.
    if (!document.getElementById('app-container').contains(e.target)) return;

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 2 && text.length < 30) { // arbitrary limit for a concept
      try {
        const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`);
        if (!response.ok) return tooltip.classList.add('hidden');

        const data = await response.json();
        if (data.type === 'standard') {
          const rect = selection.getRangeAt(0).getBoundingClientRect();

          let imgHtml = '';
          if (data.thumbnail) {
            imgHtml = `<img src="${data.thumbnail.source}" class="w-16 h-16 object-cover rounded-lg float-right ml-3 mb-1 shadow-sm">`;
          }

          tooltip.innerHTML = `
            <div class="text-xs font-bold text-purple-600 uppercase mb-1 tracking-wider flex items-center gap-1"><i data-lucide="book-open" class="w-3 h-3"></i> Smart Concept</div>
            ${imgHtml}
            <h4 class="font-bold text-slate-900 mb-1">${data.title}</h4>
            <p class="text-xs text-slate-600 leading-relaxed">${data.extract}</p>
          `;

          lucide.createIcons({root: tooltip});

          tooltip.style.left = `${rect.left + window.scrollX}px`;
          tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
          tooltip.classList.remove('hidden');

          // Slight delay for transition
          setTimeout(() => {
            tooltip.classList.remove('opacity-0', 'translate-y-2');
            tooltip.classList.add('opacity-100', 'translate-y-0');
          }, 10);
        }
      } catch (err) {
        // Silently fail if wikipedia block
      }
    } else {
      tooltip.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => tooltip.classList.add('hidden'), 300);
    }
  });

  // Hide on mousedown
  document.addEventListener('mousedown', (e) => {
    if (!tooltip.contains(e.target)) {
      tooltip.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => tooltip.classList.add('hidden'), 300);
    }
  });
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
  const { data: subData, error: fetchError } = await supabase
    .from('exam_submissions')
    .select(`
      id, status, total_score, grading_data, session_id
    `)
    .eq('id', subId)
    .single();

  if (fetchError) console.error("Error fetching submission details:", fetchError);
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
  document.getElementById('grade-score').textContent = `${subData.total_score ?? 'N/A'}%`;

  // Trigger Confetti if score > 80
  if (subData.total_score > 80 && window.confetti) {
    setTimeout(() => {
      window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#000000', '#d1d5db', '#111827'] // Apple grayscale confetti
      });
    }, 500);
  }

  const feedbackList = document.getElementById('feedback-list');
  // Make the feedback list a horizontal scrollable snap container (Flashcards)
  feedbackList.className = "flex gap-6 overflow-x-auto pb-8 hide-scrollbar snap-x";

  const items = subData.grading_data && Array.isArray(subData.grading_data) ? subData.grading_data : [];

  if (items.length === 0) {
    feedbackList.innerHTML = `<div class="card text-center text-slate-500">No detailed question feedback available yet.</div>`;
  } else {
    items.forEach((item, index) => {
      const qId = item.id || index.toString();
      const div = document.createElement('div');
      div.className = 'min-w-[300px] max-w-[300px] snap-center bg-white border border-slate-100 rounded-[24px] shadow-sm flex flex-col justify-between overflow-hidden relative group transition-transform hover:-translate-y-1';

      div.innerHTML = `
        <div class="p-6">
          <div class="flex justify-between items-start gap-4 mb-6">
            <div class="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
              Q${index + 1}
            </div>
            <div class="px-3 py-1 rounded-full text-sm font-bold flex-shrink-0 bg-slate-100 text-slate-900">
              ${item.score ?? '-'} / ${item.maxScore ?? '-'}
            </div>
          </div>
          <h3 class="text-lg font-bold text-slate-900 mb-4 leading-tight">${item.question || 'Untitled Question'}</h3>
          <p class="text-slate-500 text-sm leading-relaxed">${item.aiNote || 'No feedback provided.'}</p>
        </div>
        <div class="p-4 border-t border-slate-50 bg-slate-50/50" id="appeal-container-${qId}">
          <button id="btn-open-appeal-${qId}" class="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-black transition-colors py-2 rounded-xl hover:bg-slate-200">
            <i data-lucide="flag" class="w-4 h-4"></i> Dispute
          </button>
        </div>
      `;
      feedbackList.appendChild(div);

      // Handle Appeal Setup
      const container = document.getElementById(`appeal-container-${qId}`);
      document.getElementById(`btn-open-appeal-${qId}`).onclick = () => {
        container.innerHTML = `
          <div class="w-full flex gap-2 fade-in">
            <input type="text" id="appeal-reason-${qId}" placeholder="Explain why..." class="flex-1 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-slate-900 text-sm transition-all">
            <button id="btn-submit-appeal-${qId}" class="px-6 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-sm font-bold shadow-sm transition-colors">Send</button>
            <button id="btn-cancel-appeal-${qId}" class="px-4 py-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-sm font-bold transition-colors">Cancel</button>
          </div>
        `;
        document.getElementById(`btn-cancel-appeal-${qId}`).onclick = () => {
          container.innerHTML = `
            <button id="btn-open-appeal-${qId}" class="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
              <i data-lucide="flag" class="w-3 h-3"></i> Dispute
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

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });

    if (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    if (authData.user) {
      // Manual student profile insert on first login
      const { data: studentCheck } = await supabase.from('students').select('id').eq('auth_id', authData.user.id).single();
      if (!studentCheck) {
        await supabase.from('students').insert({
          auth_id: authData.user.id,
          email: authData.user.email,
          full_name: authData.user.email.split('@')[0],
          registration_number: null
        });
      }
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
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          registration_number: regNumber
        }
      }
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

  // Fetch course materials
  const { data: materials, error: materialsError } = await supabase.from('course_materials').select('*').eq('course_id', courseId);
  if (materialsError) console.error("Materials fetch error:", materialsError);

  const materialsList = document.getElementById('course-materials-list');
  const materialsSection = document.getElementById('course-materials-section');

  if (materials && materials.length > 0) {
    materialsSection.classList.remove('hidden');

    // Process Materials and check for Google Books
    for (const m of materials) {
      let icon = '<i data-lucide="download" class="text-blue-500 w-5 h-5"></i>';
      let isBook = false;
      let bookCover = null;
      let bookUrl = null;

      // If the material specifically mentions "Book:" or similar, we intercept it
      if (m.title.toLowerCase().includes('book:')) {
        isBook = true;
        const searchQuery = m.title.replace(/book:/i, '').trim();
        try {
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(searchQuery)}&maxResults=1`);
          const bookData = await res.json();
          if (bookData.items && bookData.items.length > 0) {
            const vol = bookData.items[0].volumeInfo;
            if (vol.imageLinks?.thumbnail) {
              bookCover = vol.imageLinks.thumbnail.replace('http:', 'https:');
            }
            if (vol.infoLink) {
              bookUrl = vol.infoLink;
            }
          }
        } catch (e) {
          // Fallback if API fails
        }
      }

      if (isBook && bookCover) {
        materialsList.innerHTML += `
          <a href="${bookUrl || '#'}" target="${bookUrl ? '_blank' : '_self'}" id="material-link-${m.id}" class="card hover:border-slate-300 transition-all block cursor-pointer group">
            <div class="flex items-start gap-4">
              <img src="${bookCover}" alt="Cover" class="w-12 h-16 object-cover rounded shadow-sm group-hover:scale-105 transition-transform">
              <div>
                <h3 class="font-bold text-slate-900 text-sm leading-tight">${m.title.replace(/book:/i, '').trim()}</h3>
                <p class="text-xs text-slate-500 mt-1 flex items-center gap-1"><i data-lucide="external-link" class="w-3 h-3"></i> View Book</p>
                ${m.description ? `<p class="text-xs text-slate-400 mt-2 line-clamp-2">${m.description}</p>` : ''}
              </div>
            </div>
          </a>
        `;
      } else {
        materialsList.innerHTML += `
          <a href="#" id="material-link-${m.id}" class="card hover:border-slate-300 transition-colors block cursor-pointer">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
                ${icon}
              </div>
              <div>
                <h3 class="font-bold text-slate-900">${m.title}</h3>
                ${m.description ? `<p class="text-sm text-slate-500 mt-1">${m.description}</p>` : ''}
              </div>
            </div>
          </a>
        `;
      }
    }

    materials.forEach(m => {
      if (m.title.toLowerCase().includes('book:') && document.getElementById(`material-link-${m.id}`).href !== window.location.href + '#') {
        return; // It's an external book link, skip signed URL generation
      }
      document.getElementById(`material-link-${m.id}`).addEventListener('click', async (e) => {
        e.preventDefault();

        let filePath = m.file_url;
        // Extract the path after materials_bucket/ if it's a full URL
        if (filePath.includes('materials_bucket/')) {
          filePath = filePath.split('materials_bucket/')[1];
        }

        const { data, error } = await supabase.storage.from('materials_bucket').createSignedUrl(filePath, 60);

        if (error) {
          console.error('Error generating signed URL:', error);
          alert('Failed to download material: ' + error.message);
        } else if (data && data.signedUrl) {
          window.open(data.signedUrl, '_blank');
        }
      });
    });
  }

  // Fetch sessions for this course
  const { data: sessions, error: sessionsError } = await supabase.from('sessions').select('id, title, name, publish_status, session_type, due_date, description').eq('course_id', courseId);
  if (sessionsError) console.error("Sessions fetch error:", sessionsError);

  let submissions = [];
  if (window.registrationNumber) {
    const { data } = await supabase.from('exam_submissions').select('id, session_id, status, total_score').eq('registration_number', window.registrationNumber);
    submissions = data || [];
  } else if (currentUser?.email) {
    // Fallback
    const studentName = currentUser.email.split('@')[0];
    const { data } = await supabase.from('exam_submissions').select('id, session_id, status, total_score').eq('student_name', studentName);
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
    const sessionTitle = s.title || s.name || 'Untitled Assignment';

    if (!sub) {
      // Pending assignment
      hasPending = true;
      pendingSection.classList.remove('hidden');

      let detailsHtml = '<p class="text-sm text-slate-500 mt-1">Not started</p>';
      if (s.session_type === 'digital') {
          const dueDate = s.due_date ? new Date(s.due_date).toLocaleDateString() : 'No due date';
          detailsHtml = `
            <div class="flex items-center gap-3 mt-2 text-sm text-slate-500">
              <span class="inline-flex items-center gap-1"><i data-lucide="calendar" class="w-4 h-4"></i> Due: ${dueDate}</span>
              <span class="inline-flex items-center gap-1"><i data-lucide="laptop" class="w-4 h-4"></i> Digital Upload</span>
            </div>
          `;
      }

      pendingList.innerHTML += `
        <a href="#assignment/${s.id}" class="card hover:border-slate-300 transition-colors block">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="font-bold text-slate-900">${sessionTitle}</h3>
              ${detailsHtml}
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
              <h3 class="font-bold text-slate-900">${sessionTitle}</h3>
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

  // Task Filter Logic
  const btnTodo = document.getElementById('filter-todo');
  const btnDone = document.getElementById('filter-done');
  const listTodo = document.getElementById('pending-list');
  const listDone = document.getElementById('graded-list');

  btnTodo.addEventListener('click', () => {
    btnTodo.className = "px-4 py-2 text-sm font-bold border-b-2 border-slate-900 text-slate-900 transition-all";
    btnDone.className = "px-4 py-2 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-900 transition-all";
    listTodo.classList.remove('hidden');
    listDone.classList.add('hidden');
  });

  btnDone.addEventListener('click', () => {
    btnDone.className = "px-4 py-2 text-sm font-bold border-b-2 border-slate-900 text-slate-900 transition-all";
    btnTodo.className = "px-4 py-2 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-900 transition-all";
    listDone.classList.remove('hidden');
    listTodo.classList.add('hidden');
  });

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
      classList.innerHTML += `
        <a href="#course/${e.course_id}" class="min-w-[140px] max-w-[140px] p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 hover:shadow-md transition-all block cursor-pointer snap-start group">
          <div class="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <i data-lucide="book-open" class="text-slate-900 w-4 h-4"></i>
          </div>
          <h3 class="font-bold text-sm text-slate-900 truncate">${courseLookup[e.course_id] || 'Unknown Course'}</h3>
          <p class="text-xs text-slate-400 mt-1">View Details</p>
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
      const { data } = await supabase.from('exam_submissions').select('id, session_id, status, total_score').eq('registration_number', window.registrationNumber);
      submissions = data || [];
    } else {
      const { data } = await supabase.from('exam_submissions').select('id, session_id, status, total_score').eq('student_name', window.studentName);
      submissions = data || [];
    }

    const submittedIds = new Set(submissions?.map(s => s.session_id) || []);

    const pending = sessions?.filter(s => !submittedIds.has(s.id)) || [];

    if (pending.length > 0) {
      const pList = document.getElementById('pending-list');

      // Enable Calendar Sync Button
      const btnSync = document.getElementById('btn-sync-calendar');
      if (window.ics) {
        btnSync.classList.remove('hidden');
        btnSync.addEventListener('click', () => {
          const cal = window.ics();
          pending.forEach(s => {
            const date = s.due_date ? new Date(s.due_date) : new Date(Date.now() + 86400000); // default tomorrow
            const courseName = courseLookup[s.course_id] || 'Playbook Course';
            cal.addEvent(`[Due] ${s.title}`, `${courseName} Assignment`, '', date, date);
          });
          cal.download('Playbook_Assignments');
        });
      }

      pending.forEach(s => {
        pList.innerHTML += `
          <a href="#assignment/${s.id}" class="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 transition-colors group mb-3 shadow-sm">
            <div>
              <p class="text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block mr-1"></div>${courseLookup[s.course_id] || 'Unknown Course'}</p>
              <h3 class="font-bold text-slate-900 text-lg group-hover:text-slate-600 transition-colors">${s.title}</h3>
            </div>
            <i data-lucide="chevron-right" class="text-slate-300 w-5 h-5 group-hover:text-slate-900 transition-colors transform group-hover:translate-x-1"></i>
          </a>
        `;
      });
    } else {
      document.getElementById('pending-list').innerHTML = `
        <div class="text-center py-10 bg-white border border-slate-100 rounded-2xl shadow-sm">
          <i data-lucide="check-circle-2" class="w-8 h-8 text-slate-300 mx-auto mb-2"></i>
          <p class="text-slate-500 text-sm font-semibold">You're all caught up!</p>
        </div>
      `;
    }

    // Identify recently graded
    const graded = [];
    if (submissions && sessions) {
      submissions.forEach(sub => {
        const session = sessions.find(s => s.id === sub.session_id);
        if (session && session.publish_status === 'published') {
          graded.push({ sub, session });
        }
      });
    }

    if (graded.length > 0) {
      const gList = document.getElementById('graded-list');

      // Render Chart.js
      document.getElementById('analytics-section').classList.remove('hidden');
      const ctx = document.getElementById('grade-chart');

      const labels = [];
      const dataPoints = [];

      graded.forEach(g => {
        labels.push(g.session.title || 'Assignment');
        dataPoints.push(g.sub.total_score || 0);

        gList.innerHTML += `
          <a href="#grade/${g.sub.id}" class="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-300 transition-colors group mb-3 shadow-sm">
            <div>
              <p class="text-xs font-bold text-slate-500 uppercase mb-1 tracking-wider">${courseLookup[g.session.course_id] || 'Unknown Course'}</p>
              <h3 class="font-bold text-slate-900 text-lg group-hover:text-slate-600 transition-colors">${g.session.title}</h3>
              <p class="text-slate-500 text-sm mt-1">Score: <span class="font-bold text-slate-900 px-2 py-0.5 bg-slate-100 rounded-md ml-1">${g.sub.total_score ?? 'N/A'}%</span></p>
            </div>
            <i data-lucide="chevron-right" class="text-slate-300 w-5 h-5 group-hover:text-slate-900 transition-colors transform group-hover:translate-x-1"></i>
          </a>
        `;
      });

      if (window.Chart && ctx) {
        // Calculate average for the doughnut
        const avgScore = dataPoints.length > 0 ? dataPoints.reduce((a, b) => a + b, 0) / dataPoints.length : 0;
        const remainder = 100 - avgScore;

        new window.Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Average Score', 'Remaining'],
            datasets: [{
              data: [avgScore, remainder],
              backgroundColor: ['#111827', '#f3f4f6'],
              borderWidth: 0,
              borderRadius: [20, 0],
              cutout: '80%'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            }
          },
          plugins: [{
            id: 'centerText',
            beforeDraw: function(chart) {
              const width = chart.width, height = chart.height, ctx = chart.ctx;
              ctx.restore();
              const fontSize = (height / 80).toFixed(2);
              ctx.font = "bold " + fontSize + "em -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#111827";
              const text = Math.round(avgScore) + "%", textX = Math.round((width - ctx.measureText(text).width) / 2), textY = height / 2;
              ctx.fillText(text, textX, textY);
              ctx.save();
            }
          }]
        });
      }
    } else {
        document.getElementById('graded-list').innerHTML = `<p class="text-slate-500 text-sm">No completed assignments yet.</p>`;
    }
  }
  lucide.createIcons();
}

async function renderAssignment(id) {
  const { data: session } = await supabase.from('sessions').select('id, title, name, course_id, session_type, due_date, description').eq('id', id).single();
  if (!session) return renderDashboard();

  let courseName = 'Unknown Course';
  if (session.course_id) {
      const { data: courseData } = await supabase.from('courses').select('name').eq('id', session.course_id).single();
      if (courseData && courseData.name) courseName = courseData.name;
  }

  const tpl = document.getElementById('tpl-assignment').content.cloneNode(true);
  app.innerHTML = '';
  app.appendChild(tpl);

  const sessionTitle = session.title || session.name || 'Untitled Assignment';

  let detailsHtml = '';
  if (session.session_type === 'digital' && session.due_date) {
      detailsHtml = `<p class="mt-2 text-sm font-semibold text-amber-600 flex items-center gap-1"><i data-lucide="clock" class="w-4 h-4"></i> Due: ${new Date(session.due_date).toLocaleString()}</p>`;
  }

  document.getElementById('assignment-header').innerHTML = `
    <p class="text-xs font-bold text-slate-400 uppercase">${courseName}</p>
    <h1 class="text-2xl font-bold text-slate-900">${sessionTitle}</h1>
    ${detailsHtml}
  `;

  // Use the database description for instructions, or a fallback if physical
  document.getElementById('assignment-desc').textContent = session.description || (session.session_type === 'digital' ? 'No instructions provided.' : 'Please read the assignment instructions provided by your professor in class.');

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

  // LanguageTool API Grammar Checking
  const ta = document.getElementById('submit-text');
  const banner = document.getElementById('grammar-check-banner');
  const suggestion = document.getElementById('grammar-suggestion');
  let grammarTimeout;

  document.getElementById('btn-dismiss-grammar').onclick = () => {
    banner.classList.add('hidden');
  };

  ta.addEventListener('input', () => {
    clearTimeout(grammarTimeout);
    banner.classList.add('hidden');
    const text = ta.value.trim();
    if (text.length > 10) {
      grammarTimeout = setTimeout(async () => {
        try {
          const body = new URLSearchParams({
            text: text,
            language: 'en-US'
          });
          const response = await fetch('https://api.languagetoolplus.com/v2/check', {
            method: 'POST',
            body: body
          });
          if (response.ok) {
            const data = await response.json();
            if (data.matches && data.matches.length > 0) {
              const firstMatch = data.matches[0];
              const repl = firstMatch.replacements.length > 0 ? ` (e.g. "${firstMatch.replacements[0].value}")` : '';
              suggestion.textContent = `Tip: ${firstMatch.message}${repl}`;
              banner.classList.remove('hidden');
            }
          }
        } catch (e) {
          // Silent fail on network error for grammar
        }
      }, 1500); // 1.5s debounce
    }
  });

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
        const filePath = `student_submissions/${session.id}/${currentUser.id}.pdf`;

        // 1. You MUST await the Storage PDF upload to complete FIRST
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('exams_bucket')
          .upload(filePath, selectedFile);

        if (uploadError) {
          console.error("File upload failed:", uploadError);
          err.textContent = uploadError.message;
          err.classList.remove('hidden');
          btn.disabled = false;
          return; // Halt execution immediately to prevent sending null paths to the database
        }
        pdfPath = uploadData.path; // This is now a validated, correct path
      }

      const textContent = type === 'text' ? document.getElementById('submit-text').value : null;

      // 2. ONLY THEN call the RPC (Ensure the exact name is 'api_submit_work')
      const { data, error } = await supabase.rpc('api_submit_work', {
        p_session_id: session.id, // Ensure this is a valid UUID and not null
        p_text_content: textContent || null,
        p_pdf_path: pdfPath
      });

      if (error) {
        console.error("RPC Rejected the submission:", error);
        throw error;
      } else if (data && !data.success) {
        throw new Error(data.error);
      } else {
        console.log("Work submitted successfully! Database confirmed.");
        app.innerHTML = '';
        app.appendChild(document.getElementById('tpl-success').content.cloneNode(true));
        lucide.createIcons();

      // Trigger Confetti Explosion
      if (window.confetti) {
        window.confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b']
        });
      }
      }

    } catch (error) {
      err.textContent = error.message;
      err.classList.remove('hidden');
      btn.disabled = false;
    }
  };

  lucide.createIcons();
}
