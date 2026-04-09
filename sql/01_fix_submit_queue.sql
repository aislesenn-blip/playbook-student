-- 1. Futa function ya zamani kwanza (Kama Hint ilivyoshauri)
DROP FUNCTION IF EXISTS public.api_submit_work(UUID, TEXT, TEXT);

-- 2. Tengeneza mpya inayosafirisha data kwenda kwa AI kupitia Webhook
CREATE OR REPLACE FUNCTION public.api_submit_work(
    p_session_id UUID,
    p_text_content TEXT,
    p_pdf_path TEXT
) RETURNS JSONB AS $$
DECLARE
    v_student_id UUID;
    v_student_name TEXT;
    v_reg_num TEXT;
    v_submission_id UUID;
    v_session_title TEXT;
    v_webhook_url TEXT := 'https://jlloehfeqjrkxeoqvmfk.supabase.co/functions/v1/grade_exam';
BEGIN
    -- Ulinzi: Hakikisha Session ID ipo
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session ID is required.');
    END IF;

    -- Tafuta taarifa za mwanafunzi
    SELECT id, full_name, registration_number INTO v_student_id, v_student_name, v_reg_num
    FROM public.students WHERE auth_id = auth.uid() LIMIT 1;

    IF v_student_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Student profile not found.');
    END IF;

    -- Tafuta jina la assignment (Kwa ajili ya AI kujua inasahihisha nini)
    SELECT COALESCE(title, name, 'Unknown Assignment') INTO v_session_title
    FROM public.sessions WHERE id = p_session_id;

    -- Ingiza kazi kwenye database (Kwa kutumia columns ZETU sahihi)
    INSERT INTO public.exam_submissions (
        session_id, student_name, registration_number, text_content, pdf_storage_path, status
    ) VALUES (
        p_session_id, v_student_name, v_reg_num, p_text_content, p_pdf_path, 'pending'
    ) RETURNING id INTO v_submission_id;

    -- Weka kazi kwenye foleni ya AI (Queue the AI grading task via pg_net)
    INSERT INTO net.http_request_queue (url, method, headers, body)
    VALUES (
        v_webhook_url,
        'POST',
        '[{"Content-Type": "application/json"}]',
        jsonb_build_object(
            'submission_id', v_submission_id,
            'assignment_name', v_session_title,
            'pdf_path', p_pdf_path,
            'text_content', p_text_content
        )
    );

    RETURN jsonb_build_object('success', true, 'submission_id', v_submission_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
