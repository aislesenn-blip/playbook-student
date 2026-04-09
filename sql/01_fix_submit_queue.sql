-- ==============================================================================
-- RUN THIS IN YOUR SUPABASE SQL EDITOR TO FIX THE "http_request_queue" URL ERROR
-- ==============================================================================

-- If you are using pg_net and triggers to call the AI edge function:
-- This creates a robust trigger that maps the assignment name and constructs the correct payload.

CREATE OR REPLACE FUNCTION queue_exam_for_grading()
RETURNS TRIGGER AS $$
DECLARE
    v_webhook_url text := 'https://jlloehfeqjrkxeoqvmfk.supabase.co/functions/v1/grade_exam';
    v_session_title text;
BEGIN
    -- Resolve the actual assignment name from the sessions table
    SELECT COALESCE(title, name, 'Untitled Assignment') INTO v_session_title
    FROM public.sessions WHERE id = NEW.session_id;

    -- Insert the webhook call into pg_net's http_request_queue
    INSERT INTO net.http_request_queue (url, method, headers, body)
    VALUES (
        v_webhook_url,
        'POST',
        '{"Content-Type": "application/json"}',
        json_build_object(
            'submission_id', NEW.id,
            'session_id', NEW.session_id,
            'assignment_name', v_session_title,
            'student_id', NEW.student_id,
            'pdf_path', NEW.pdf_path,
            'text_content', NEW.text_content
        )::jsonb
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_queue_exam_grading ON public.exam_submissions;
CREATE TRIGGER trg_queue_exam_grading
AFTER INSERT ON public.exam_submissions
FOR EACH ROW
EXECUTE FUNCTION queue_exam_for_grading();

-- ==============================================================================
-- If you are queueing from INSIDE the api_submit_work RPC directly, use this:
-- ==============================================================================
CREATE OR REPLACE FUNCTION api_submit_work(
    p_session_id UUID,
    p_text_content TEXT,
    p_pdf_path TEXT
) RETURNS JSON AS $$
DECLARE
    v_student_id UUID;
    v_submission_id UUID;
    v_session_title TEXT;
    v_webhook_url TEXT := 'https://jlloehfeqjrkxeoqvmfk.supabase.co/functions/v1/grade_exam';
BEGIN
    -- Resolve student
    SELECT id INTO v_student_id FROM public.students WHERE auth_id = auth.uid();
    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Student profile not found.');
    END IF;

    -- Map Assignment Name
    SELECT COALESCE(title, name, 'Unknown Assignment') INTO v_session_title
    FROM public.sessions WHERE id = p_session_id;

    -- Insert Submission
    INSERT INTO public.exam_submissions (session_id, student_id, text_content, pdf_path, status)
    VALUES (p_session_id, v_student_id, p_text_content, p_pdf_path, 'submitted')
    RETURNING id INTO v_submission_id;

    -- Queue the AI grading task (Fixes the null url constraint)
    INSERT INTO net.http_request_queue (url, method, headers, body)
    VALUES (
        v_webhook_url,
        'POST',
        '{"Content-Type": "application/json"}',
        json_build_object(
            'submission_id', v_submission_id,
            'assignment_name', v_session_title,
            'pdf_path', p_pdf_path,
            'text_content', p_text_content
        )::jsonb
    );

    RETURN json_build_object('success', true, 'submission_id', v_submission_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
