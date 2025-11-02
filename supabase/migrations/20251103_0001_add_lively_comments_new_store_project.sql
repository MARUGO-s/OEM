-- 新店舗出展計画 2025 プロジェクトに活発なコメントと意見交換を追加
-- 自然なディスカッション形式で会話が成り立つコメントを追加

DO $$
DECLARE
    new_store_project_id UUID;
    yoshito111_user_id UUID;
    itagawa_user_id UUID;
    design_user_id UUID;
    manager_user_id UUID;
    pingus0428_user_id UUID;
    comment_counter INTEGER := 1;
    reply_counter INTEGER := 1;
    disc_counter INTEGER := 1;
    disc_reply_counter INTEGER := 1;
    parent_comment_ids TEXT[];
    parent_id TEXT;
    reply_count INTEGER;
    reaction_counter INTEGER := 1;
    reaction_types TEXT[] := ARRAY['thumbs_up', 'heart', 'celebration', 'eyes', 'rocket', 'fire'];
    disc_comment_id TEXT;
    reaction_user_id UUID;
    reaction_type TEXT;
    reaction_users UUID[];
    reaction_count INTEGER;
    comment_author_id UUID;
    reply_author_id UUID;
    available_users UUID[];
    author_index INTEGER;
BEGIN
    -- プロジェクトIDを取得
    SELECT id INTO new_store_project_id FROM projects WHERE name = '新店舗出展計画 2025' LIMIT 1;
    
    IF new_store_project_id IS NULL THEN
        RAISE EXCEPTION '新店舗出展計画 2025 プロジェクトが見つかりません';
    END IF;

    -- ユーザーIDを取得
    SELECT id INTO yoshito111_user_id FROM user_profiles WHERE username = 'yoshito111' LIMIT 1;
    SELECT id INTO itagawa_user_id FROM user_profiles WHERE username = 'itagawa' LIMIT 1;
    SELECT id INTO design_user_id FROM user_profiles WHERE username = 'design' LIMIT 1;
    SELECT id INTO manager_user_id FROM user_profiles WHERE username = 'manager' LIMIT 1;
    SELECT id INTO pingus0428_user_id FROM user_profiles WHERE email = 'pingus0428@gmail.com' LIMIT 1;
    
    -- タスクが存在しない場合は作成する
    IF NOT EXISTS (SELECT 1 FROM tasks WHERE project_id = new_store_project_id AND id = 'newstore_task_001') THEN
        RAISE NOTICE '新店舗出展計画 2025 プロジェクトのタスクが見つかりません。タスクを作成します...';
        
        INSERT INTO tasks (id, title, description, status, priority, deadline, project_id, created_by, created_at, updated_at) VALUES
        ('newstore_task_001', '出展場所の最終選定', '東京駅前の3候補から最適な物件を選定。家賃、立地、客層、競合を総合的に評価し、収益性の高い物件を選定する', 'completed', 'high', '2025-01-15', new_store_project_id, yoshito111_user_id, '2025-01-10 09:00:00+00', '2025-01-15 18:00:00+00'),
        ('newstore_task_002', '店舗デザイン・内装設計', '"モダン和食"をテーマにした店舗デザインと内装工事の設計・発注。木材と金属を組み合わせたスタイリッシュな空間を創出', 'in_progress', 'high', '2025-02-10', new_store_project_id, design_user_id, '2025-01-11 10:00:00+00', '2025-01-26 15:30:00+00'),
        ('newstore_task_003', '厨房機器選定・発注', '新店舗に必要な厨房機器一式の選定と発注。効率性と安全性を最優先に、予算内で最高品質の機器を選択', 'pending', 'high', '2025-02-20', new_store_project_id, yoshito111_user_id, '2025-01-12 09:30:00+00', '2025-01-12 09:30:00+00'),
        ('newstore_task_004', 'メニュー開発・試作', '新店舗オリジナルメニューの開発と試作。和のエッセンスをモダンにアレンジした独自性の高い料理を考案', 'pending', 'high', '2025-02-25', new_store_project_id, itagawa_user_id, '2025-01-13 11:00:00+00', '2025-01-13 11:00:00+00'),
        ('newstore_task_005', '人員採用・教育計画', 'シェフ、ホールスタッフの採用と教育プログラム策定。新店舗のコンセプトを正しく伝えられる人材を確保', 'pending', 'medium', '2025-03-05', new_store_project_id, manager_user_id, '2025-01-14 10:00:00+00', '2025-01-14 10:00:00+00'),
        ('newstore_task_006', '広告・オープニング準備', '新店舗の広告戦略とオープニングイベントの企画。SNSマーケティング、プレスリリース、初日イベントを準備', 'pending', 'medium', '2025-03-15', new_store_project_id, yoshito111_user_id, '2025-01-15 09:00:00+00', '2025-01-15 09:00:00+00')
        ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE 'タスクを作成しました';
    END IF;

    -- ============================================
    -- タスク1: 出展場所の最終選定 - 自然なディスカッション
    -- ============================================
    
    -- 親コメント（8個）
    INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
    ('newstore_task1_comment_001', 'newstore_task_001', new_store_project_id, yoshito111_user_id, 'yoshito111', 
     '物件Aの契約書類を確認しました。条件面で問題なさそうですね。次は正式契約ですね', 
     '2025-01-15 09:00:00+00'::timestamp with time zone),
    ('newstore_task1_comment_002', 'newstore_task_001', new_store_project_id, manager_user_id, 'manager', 
     '駅直結という立地、本当に良いですね！入口デザインで差別化できそうです', 
     '2025-01-15 10:30:00+00'::timestamp with time zone),
    ('newstore_task1_comment_003', 'newstore_task_001', new_store_project_id, itagawa_user_id, 'itagawa', 
     '近隣の競合店調査が完了しました。ターゲット層が明確になってきました。差別化ポイントも整理できそうです', 
     '2025-01-15 14:00:00+00'::timestamp with time zone),
    ('newstore_task1_comment_004', 'newstore_task_001', new_store_project_id, yoshito111_user_id, 'yoshito111', 
     '駐車場の確保について、まだ交渉の余地があるようですが、お客様の利便性を考えると重要ですよね。@managerさん、どう進めましょうか？', 
     '2025-01-16 09:15:00+00'::timestamp with time zone),
    ('newstore_task1_comment_005', 'newstore_task_001', new_store_project_id, design_user_id, 'design', 
     '家賃の交渉、お疲れ様でした！予算内に収まったのは本当に良かったです。これで内装デザインにも余裕ができますね', 
     '2025-01-16 11:00:00+00'::timestamp with time zone),
    ('newstore_task1_comment_006', 'newstore_task_001', new_store_project_id, manager_user_id, 'manager', 
     '物件Aの近隣エリアの通行量調査を実施しました。昼間・夜間ともに集客見込みは十分です。マーケティング戦略も立てやすそうです', 
     '2025-01-16 15:30:00+00'::timestamp with time zone),
    ('newstore_task1_comment_007', 'newstore_task_001', new_store_project_id, yoshito111_user_id, 'yoshito111', 
     '物件Aの契約が正式に確定しました！これで安心して内装デザインの詳細設計に入れますね。@designさん、お願いします！', 
     '2025-01-17 10:00:00+00'::timestamp with time zone),
    ('newstore_task1_comment_008', 'newstore_task_001', new_store_project_id, itagawa_user_id, 'itagawa', 
     '物件周辺のマーケットリサーチ結果を共有しますね。ターゲット層とのマッチングも良好で、集客面での不安はなさそうです。メニュー開発にも活かせますね', 
     '2025-01-17 16:00:00+00'::timestamp with time zone)
    ON CONFLICT (id) DO NOTHING;
    
    comment_counter := 9;

    -- 返信（各親コメントに2-3個）
    parent_comment_ids := ARRAY['newstore_task1_comment_001', 'newstore_task1_comment_002', 'newstore_task1_comment_003', 
                                'newstore_task1_comment_004', 'newstore_task1_comment_005', 'newstore_task1_comment_006',
                                'newstore_task1_comment_007', 'newstore_task1_comment_008'];
    FOREACH parent_id IN ARRAY parent_comment_ids LOOP
        reply_count := 2 + (random() * 2)::INTEGER; -- 2-3個の返信
        FOR i IN 1..reply_count LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task1_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_001', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN manager_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'manager' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'design' END,
             CASE (reply_counter % 10)
                 WHEN 0 THEN '了解です！契約書の原本はいつ届きますか？正式契約の日程も調整しましょうか'
                 WHEN 1 THEN '確かにその通りですね。入口のインパクトは重要です。@designさん、相談しましょうか？'
                 WHEN 2 THEN '調査お疲れ様です！差別化ポイントをどう活かすか、これからが本番ですね。メニューにも反映させたいです'
                 WHEN 3 THEN '駐車場の交渉、引き続きお願いします。お客様の利便性は最優先ですね。状況を共有してもらえますか？'
                 WHEN 4 THEN '本当に良かったです！予算が確保できたことで、他の部分にも余裕ができますね。内装も良いものにできそうです'
                 WHEN 5 THEN '通行量調査の結果、期待以上で安心しました。集客戦略を練り直せますね。SNSマーケティングも効果的そうです'
                 WHEN 6 THEN 'おめでとうございます！契約確定で一気に動けますね。@designさん、詳細設計お願いします！スケジュールも確認しましょう'
                 WHEN 7 THEN 'マーケットリサーチ、参考になります。メニュー開発にも活かせそうです。詳細なデータも共有してもらえますか？'
                 WHEN 8 THEN '駅直結という立地の強みを最大限活かせるよう、マーケティング戦略も練り直しましょう。ランチタイムの集客が期待できそうです'
                 ELSE '物件選定、本当にお疲れ様でした！これで次のステップへスムーズに移行できそうですね。チーム一丸となって頑張りましょう！'
             END,
             parent_id,
             ('2025-01-' || LPAD(LEAST(31, 17 + (reply_counter / 5)::INTEGER)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (reply_counter % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 7 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- タスク2: 店舗デザイン・内装設計 - 自然なディスカッション
    -- ============================================
    
    -- 親コメント（10個）
    FOR i IN 1..10 LOOP
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_task2_comment_' || LPAD(comment_counter::TEXT, 3, '0'), 'newstore_task_002', new_store_project_id,
         CASE (i % 4) WHEN 0 THEN design_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE manager_user_id END,
         CASE (i % 4) WHEN 0 THEN 'design' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'manager' END,
         CASE i
             WHEN 1 THEN 'デザイン案の第1バージョンが完成しました！木材と金属のコントラストを重視した和モダンな雰囲気になっています。みなさんの意見を聞かせてください'
             WHEN 2 THEN '照明計画についてですが、料理が美しく見えるよう間接照明を多用する方向で進めています。シェフの作業スペースもしっかり照らせるようにしますね'
             WHEN 3 THEN 'テーブルレイアウト、効率的な動線を意識して設計しました。お客様の動きとスタッフの動きがスムーズになるよう配慮しています。@managerさん、確認お願いします'
             WHEN 4 THEN 'カウンター席の配置についてですが、シェフとの距離感を重視しています。オープンキッチンならではの一体感を演出したいですね。@itagawaさん、どう思いますか？'
             WHEN 5 THEN '内装材の選定が完了しました！耐久性と見た目のバランスを考えて選びました。サンプルを見せられるので、実際に見てもらえますか？'
             WHEN 6 THEN '配色についてですが、和モダンな雰囲気を保ちつつ、現代的で洗練された印象を与えるよう工夫しています。みなさんの意見を聞かせてください'
             WHEN 7 THEN 'エントランスのデザイン案を3パターン準備しました。お客様に「和」を感じてもらえるような工夫をしています。どれが良いか意見をください'
             WHEN 8 THEN 'ユニフォームのデザイン案もできました。店舗コンセプトに合わせたスタイリッシュなものにしています。試着してもらえますか？@managerさん'
             WHEN 9 THEN 'デザインの詳細について、来週プレゼンテーションを行います。全体的な方向性の確認をお願いしたいです。日程調整お願いします'
             ELSE '壁面アートのアイデアを考えています。和モダンに合うデザインで、空間にアクセントを加えたいですね。アイデアがあれば教えてください'
         END,
         ('2025-01-' || LPAD(LEAST(31, 18 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 6 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        comment_counter := comment_counter + 1;
    END LOOP;

    -- 返信（各親コメントに2-4個）
    FOR i IN 19..28 LOOP
        reply_count := 2 + (random() * 3)::INTEGER; -- 2-4個の返信
        FOR j IN 1..reply_count LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task2_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_002', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN design_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE manager_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'design' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'manager' END,
             CASE (reply_counter % 12)
                 WHEN 0 THEN 'デザイン案、本当に素晴らしいです！この方向性で進めましょう。木材と金属のコントラスト、非常に効果的だと思います'
                 WHEN 1 THEN '照明の配置について、もう少し検討の余地がありそうですが、基本的な方向性は良いと思います。照明専門家にも相談してみますか？'
                 WHEN 2 THEN 'テーブルレイアウト、確認しました！動線は問題なさそうです。ただ、この部分をもう少し広く取れると、より作業しやすくなるかもしれません'
                 WHEN 3 THEN 'カウンター席の配置、シェフとの距離感が絶妙ですね。お客様が料理を楽しみながら会話もできる良い設計だと思います。この方向で進めましょう'
                 WHEN 4 THEN '内装材のサンプル、見せてもらえますか？実際の質感を確認したいです。耐久性も気になりますね'
                 WHEN 5 THEN '配色の提案、とても良いと思います！和モダンな雰囲気が出ていて、採用したいです。この方向で進めましょう'
                 WHEN 6 THEN 'エントランスのデザイン、3パターンとも良いですね。第2案が特に気に入りました。他のメンバーの意見も聞いてみましょうか'
                 WHEN 7 THEN 'ユニフォームの試着、ぜひお願いします。動きやすさも重要なので、実際に着てみて確認したいですね。スタッフの意見も聞きたいです'
                 WHEN 8 THEN 'プレゼンテーション、楽しみにしています。全体的な方向性が把握できるので、早めに日程を決めましょうか。来週中はどうでしょうか？'
                 WHEN 9 THEN '壁面アートのアイデア、楽しみにしています。空間の雰囲気をさらに高めるものになりそうです。和の要素を取り入れると良いですね'
                 WHEN 10 THEN 'デザインの細部までこだわっていて、素晴らしいと思います。お客様に喜んでもらえそうです。この調子で進めていきましょう！'
                 ELSE '全体のバランスがとても良いですね。和モダンな雰囲気が出ていて、コンセプトに合っていると思います'
             END,
             'newstore_task2_comment_' || LPAD(i::TEXT, 3, '0'),
             ('2025-01-' || LPAD(LEAST(31, 18 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 7 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- タスク3: 厨房機器選定・発注 - 自然なディスカッション
    -- ============================================
    
    FOR i IN 1..6 LOOP
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_task3_comment_' || LPAD(comment_counter::TEXT, 3, '0'), 'newstore_task_003', new_store_project_id,
         CASE (i % 4) WHEN 0 THEN manager_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
         CASE (i % 4) WHEN 0 THEN 'manager' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'design' END,
         CASE i
             WHEN 1 THEN '厨房機器の見積もりを3社から取得しました。性能とコストのバランスを考えて選定中です。みなさんの意見も聞かせてください'
             WHEN 2 THEN '特に冷蔵庫とオーブンの選定が重要ですね。省エネ性能も考慮して、長期的な運用コストも計算しています。@itagawaさん、どう思いますか？'
             WHEN 3 THEN '食器洗浄機の導入を検討しています。人件費削減に繋がりそうです。どのタイプが良いか、意見をください'
             WHEN 4 THEN 'IHコンロの導入についてですが、火災リスクの軽減と清掃のしやすさがメリットですね。検討の価値がありそうです。@managerさん'
             WHEN 5 THEN '厨房機器の配置図を作成しました。動線に無駄がないか確認してもらえますか？@itagawaさん、特に確認お願いします'
             ELSE '厨房機器の搬入スケジュールを確認しました。内装工事との調整が必要ですね。@yoshito111さん、スケジュール調整お願いします'
         END,
         ('2025-01-' || LPAD(LEAST(31, 25 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 5 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        comment_counter := comment_counter + 1;
        
        -- 返信を2-3個追加
        FOR j IN 1..(2 + (random() * 2)::INTEGER) LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task3_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_003', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN manager_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'manager' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'design' END,
             CASE (reply_counter % 8)
                 WHEN 0 THEN '見積もり、お疲れ様でした！3社比較すると違いが明確ですね。性能とコストのバランス、慎重に検討しましょう'
                 WHEN 1 THEN '冷蔵庫とオーブン、確かに重要ですね。省エネ性能は長期的に見て大きなメリットになりそうです。サンプル実演してもらえますか？'
                 WHEN 2 THEN '食器洗浄機の導入、賛成です！清潔さも保てますし、人件費削減にも繋がりますね。どのタイプが効率的か、さらに検討しましょう'
                 WHEN 3 THEN 'IHコンロ、良いアイデアですね。清掃が楽になるのは大きなメリットです。シェフの作業効率も上がりそうです。採用検討しましょう'
                 WHEN 4 THEN '配置図、確認しました！動線は問題なさそうです。ただ、この部分をもう少し広く取れると、より作業しやすくなるかもしれません'
                 WHEN 5 THEN 'グリストラップの件、設計チームと連携して最適な場所を確保しましょう。排水の流れも重要ですからね'
                 WHEN 6 THEN '搬入スケジュール、内装工事との調整は重要ですね。工程表を確認して、最適なタイミングを決めましょう。スケジュール共有します'
                 ELSE '機器の選定、順調に進んでいますね。効率性と安全性を最優先に選定しましょう。この調子で進めていきましょう！'
             END,
             'newstore_task3_comment_' || LPAD((comment_counter - 1)::TEXT, 3, '0'),
             ('2025-01-' || LPAD(LEAST(31, 25 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 7 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- タスク4: メニュー開発・試作 - 自然なディスカッション
    -- ============================================
    
    FOR i IN 1..8 LOOP
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_task4_comment_' || LPAD(comment_counter::TEXT, 3, '0'), 'newstore_task_004', new_store_project_id,
         CASE (i % 4) WHEN 0 THEN itagawa_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN manager_user_id ELSE design_user_id END,
         CASE (i % 4) WHEN 0 THEN 'itagawa' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'manager' ELSE 'design' END,
         CASE i
             WHEN 1 THEN 'オリジナルメニューのアイデアが出揃いました！和のエッセンスをモダンにアレンジした独自性の高い料理を考案しています。試食会の日程、調整しましょうか'
             WHEN 2 THEN '季節感を大切にしたメニュー構成を考えています。旬の食材を活かして、お客様に季節を感じてもらえる料理にしたいですね。みなさんどう思いますか？'
             WHEN 3 THEN 'ドリンクメニューについても検討が必要ですね。日本酒やワインのペアリングも提案したいです。料理との相性を考えて選びましょう'
             WHEN 4 THEN 'デザートメニューの開発も進めています。和の要素を取り入れた、目にも美しいデザートを考えています。アイデアがあれば教えてください'
             WHEN 5 THEN '原価計算を行いました。利益率を確保できる価格設定を検討しています。メニューごとの詳細を共有しますね。@managerさん、確認お願いします'
             WHEN 6 THEN '盛り付けの美しさも重要です。視覚的にも楽しめる料理を目指しています。実際の盛り付けも見せられるので、確認してもらえますか？'
             WHEN 7 THEN '試作の進捗ですが、順調です。期待以上のものができそうです。試食会の日程、早めに決めましょうか？みんなで試食して調整したいですね'
             ELSE '食材の調達先を最終決定しました。安定供給が可能な信頼できる業者と契約できそうです。品質も確認済みです。安心して進められますね'
         END,
         ('2025-01-' || LPAD(LEAST(31, 26 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 6 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        comment_counter := comment_counter + 1;
        
        -- 返信を2-3個追加
        FOR j IN 1..(2 + (random() * 2)::INTEGER) LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task4_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_004', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN itagawa_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN manager_user_id ELSE design_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'itagawa' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'manager' ELSE 'design' END,
             CASE (reply_counter % 10)
                 WHEN 0 THEN 'メニューアイデア、本当に素晴らしいですね！和とモダンの融合、独自性があって良いと思います。試食会、楽しみにしています！'
                 WHEN 1 THEN '季節感を大切にしたメニュー構成、良いですね。旬の食材を使うことで、お客様にも季節を感じてもらえそうです。月替わりメニューも検討できますね'
                 WHEN 2 THEN 'ドリンクのペアリング、重要なポイントですね。料理との相性を考えると、日本酒のラインナップを充実させたいですね。ワインも選定しましょうか？'
                 WHEN 3 THEN 'デザート、楽しみにしています！和の要素を取り入れたデザート、お客様に喜んでもらえそうです。見た目も美しくなりそうですね'
                 WHEN 4 THEN '原価計算、ありがとうございます。確認しますね。利益率を確保しつつ、お客様にとって価値のある価格設定を心がけましょう'
                 WHEN 5 THEN '盛り付けの確認、ぜひお願いします。視覚的な美しさも料理の魅力の一部ですからね。写真も撮らせてもらえますか？'
                 WHEN 6 THEN '試食会の日程、早めに決めましょうか。みんなで試食して、最終的な調整をしたいですね。来週中には可能でしょうか？'
                 WHEN 7 THEN '食材の調達先が決まったのは良かったです。安定供給と品質の両方を確保できて、安心ですね。これで本格的な準備ができますね'
                 WHEN 8 THEN 'メニュー開発、順調に進んでいますね！この調子で進めていきましょう。オリジナリティと季節感を両立させたメニュー、お客様に喜んでもらえそうです'
                 ELSE 'メニュー全体の方向性、とても良いと思います。試食会が楽しみです。この調子で進めていきましょう！'
             END,
             'newstore_task4_comment_' || LPAD((comment_counter - 1)::TEXT, 3, '0'),
             ('2025-01-' || LPAD(LEAST(31, 26 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 8 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- タスク5: 人員採用・教育計画 - 自然なディスカッション
    -- ============================================
    
    FOR i IN 1..5 LOOP
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_task5_comment_' || LPAD(comment_counter::TEXT, 3, '0'), 'newstore_task_005', new_store_project_id,
         CASE (i % 4) WHEN 0 THEN manager_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
         CASE (i % 4) WHEN 0 THEN 'manager' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'design' END,
         CASE i
             WHEN 1 THEN 'シェフの採用面接を開始しました。経験豊富な候補者が複数います。最終面接の日程、調整中です。@managerさん、参加してもらえますか？'
             WHEN 2 THEN 'ホールスタッフの募集要項を確定しました。店舗コンセプトに共感できる人材を求めています。応募状況、順調です。みなさん意見をください'
             WHEN 3 THEN '教育プログラムの草案が完成しました。OJTと座学を組み合わせたプログラムにしています。内容の確認をお願いします。@yoshito111さん'
             WHEN 4 THEN '採用スケジュールを調整中です。開店までに十分な人員を確保できる見込みです。採用面接、順調に進んでいます'
             ELSE 'チームビルディングのイベントを企画中です。スタッフ間の連携を強化して、素晴らしいチームを作りましょう！日程調整お願いします'
         END,
         ('2025-02-' || LPAD(LEAST(28, 5 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 5 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        comment_counter := comment_counter + 1;
        
        -- 返信を2-3個追加
        FOR j IN 1..(2 + (random() * 2)::INTEGER) LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task5_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_005', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN manager_user_id WHEN 1 THEN yoshito111_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'manager' WHEN 1 THEN 'yoshito111' WHEN 2 THEN 'itagawa' ELSE 'design' END,
             CASE (reply_counter % 8)
                 WHEN 0 THEN 'シェフの採用、重要ですね。経験豊富な方と一緒に働けるのは、スタッフ全体のレベルアップにも繋がります。最終面接、参加させてください'
                 WHEN 1 THEN 'ホールスタッフの募集、順調そうで良かったです。店舗コンセプトを理解してくれる人材が集まると、素晴らしいチームになりそうですね'
                 WHEN 2 THEN '教育プログラム、確認しました！OJTと座学のバランスが良くて良いと思います。実践的な内容で、スタッフも成長できそうです'
                 WHEN 3 THEN '採用スケジュール、開店日に間に合いそうで安心です。人員が揃えば、オープン準備もスムーズに進められそうですね'
                 WHEN 4 THEN 'チームビルディングのイベント、素晴らしいアイデアですね！スタッフ間の連携が良くなると、お客様へのサービスも向上します。日程調整しますね'
                 WHEN 5 THEN '採用から研修まで、しっかり準備できていて安心です。開店に向けて、素晴らしいチームを作っていきましょう'
                 WHEN 6 THEN '採用活動、順調に進んでいますね。予算内で進められているのも素晴らしいです。内定者の確定が楽しみです'
                 ELSE '人員確保と教育プログラムの準備、本当にお疲れ様です。この調子で進めていきましょう！'
             END,
             'newstore_task5_comment_' || LPAD((comment_counter - 1)::TEXT, 3, '0'),
             ('2025-02-' || LPAD(LEAST(28, 5 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 6 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- タスク6: 広告・オープニング準備 - 自然なディスカッション
    -- ============================================
    
    FOR i IN 1..6 LOOP
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_task6_comment_' || LPAD(comment_counter::TEXT, 3, '0'), 'newstore_task_006', new_store_project_id,
         CASE (i % 4) WHEN 0 THEN yoshito111_user_id WHEN 1 THEN manager_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
         CASE (i % 4) WHEN 0 THEN 'yoshito111' WHEN 1 THEN 'manager' WHEN 2 THEN 'itagawa' ELSE 'design' END,
         CASE i
             WHEN 1 THEN 'オープニング広告のデザイン案を3パターン準備中です。来週レビューしてもらえると嬉しいです。みなさんの意見を聞かせてください'
             WHEN 2 THEN 'SNSマーケティング戦略を策定しました。InstagramとTikTokを主軸にして、若年層へのアプローチを強化します。@designさん、コンテンツ制作お願いします'
             WHEN 3 THEN 'プレスリリースを作成中です。主要メディアへの配信準備を進めています。記事掲載が期待できそうです。@managerさん、確認お願いします'
             WHEN 4 THEN 'オープニングイベントの企画案が完成しました。来店促進に繋がる内容になっています。詳細を共有しますね。みなさんの意見をください'
             WHEN 5 THEN 'インフルエンサーとのコラボレーションを検討中です。若年層へのアプローチを強化できるので、ぜひ進めたいですね。候補者リスト作成中です'
             ELSE '広告予算の配分を最終決定しました。効果的な運用を目指します。各チャネルへの投資配分、最適化できそうです。@yoshito111さん、確認お願いします'
         END,
         ('2025-03-' || LPAD(LEAST(31, 1 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 7 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        comment_counter := comment_counter + 1;
        
        -- 返信を2-3個追加
        FOR j IN 1..(2 + (random() * 2)::INTEGER) LOOP
            INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_task6_reply_' || LPAD(reply_counter::TEXT, 3, '0'), 'newstore_task_006', new_store_project_id,
             CASE (reply_counter % 4) WHEN 0 THEN yoshito111_user_id WHEN 1 THEN manager_user_id WHEN 2 THEN itagawa_user_id ELSE design_user_id END,
             CASE (reply_counter % 4) WHEN 0 THEN 'yoshito111' WHEN 1 THEN 'manager' WHEN 2 THEN 'itagawa' ELSE 'design' END,
             CASE (reply_counter % 10)
                 WHEN 0 THEN '広告デザイン案、楽しみにしています！3パターンとも見せてもらえると、どれが効果的か判断できそうです。レビューに参加しますね'
                 WHEN 1 THEN 'SNSマーケティング戦略、良いですね。InstagramとTikTokは若年層へのアプローチに最適ですね。コンテンツ制作、進めましょうか'
                 WHEN 2 THEN 'プレスリリース、確認しました！内容も充実していて、メディアに取り上げてもらえそうです。配信準備、進めましょう'
                 WHEN 3 THEN 'オープニングイベントの企画、楽しみにしています！来店促進に繋がる企画だと良いですね。詳細を共有してもらえますか？'
                 WHEN 4 THEN 'インフルエンサーコラボ、良いアイデアですね！若年層へのアプローチが強化できそうです。候補者リスト、見せてもらえますか？'
                 WHEN 5 THEN '広告予算の配分、最適化できそうで良かったです。効果的な運用をして、最大限の成果を出しましょう。確認しますね'
                 WHEN 6 THEN 'オープニング準備、順調に進んでいますね。認知度向上と来店促進、両方を実現できそうです。頑張りましょう！'
                 WHEN 7 THEN '広告戦略全体として、非常に良い方向に進んでいますね。この調子で進めていきましょう！'
                 WHEN 8 THEN 'メディア向け内覧会も企画したいですね。開店前の話題作り、重要です。検討しましょうか？'
                 ELSE 'チーム一丸となって、素晴らしいオープニングにしましょう！準備、本当にお疲れ様です'
             END,
             'newstore_task6_comment_' || LPAD((comment_counter - 1)::TEXT, 3, '0'),
             ('2025-03-' || LPAD(LEAST(31, 1 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((reply_counter * 9 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            reply_counter := reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- 意見交換（discussion_comments） - 自然なディスカッション
    -- ============================================
    
    -- 親コメント（12個）
    FOR i IN 1..12 LOOP
        INSERT INTO discussion_comments (id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_disc_' || LPAD(disc_counter::TEXT, 3, '0'), new_store_project_id,
         CASE (i % 4) WHEN 0 THEN yoshito111_user_id WHEN 1 THEN itagawa_user_id WHEN 2 THEN design_user_id ELSE manager_user_id END,
         CASE (i % 4) WHEN 0 THEN 'yoshito111' WHEN 1 THEN 'itagawa' WHEN 2 THEN 'design' ELSE 'manager' END,
         CASE i
             WHEN 1 THEN '新店舗のコンセプトについて、もう一度みんなで確認したいです。「モダン和食」というコンセプト、お客様にどう伝わるか、意見を聞かせてください'
             WHEN 2 THEN 'メニュー開発の方向性について、アイデアを共有しましょう。オリジナリティと季節感をどう両立させるか、議論したいですね。@itagawaさん、どう思いますか？'
             WHEN 3 THEN '内装デザインのテーマについて、もっと議論を深めたいです。木材と金属の組み合わせ、実際の雰囲気はどうなるか、みんなのイメージを聞かせてください。@designさん'
             WHEN 4 THEN 'マーケティング戦略について、効果的なアプローチを考えましょう。SNSと従来の広告、どちらに重点を置くべきか、意見をください。@managerさん'
             WHEN 5 THEN 'オープニングイベントの企画について、アイデアを出し合いましょう。初日から多くのお客様に来店してもらうため、どんな企画が効果的か考えましょう'
             WHEN 6 THEN 'スタッフ教育プログラムについて、内容を詰めていきましょう。接客と料理知識、どちらを重視すべきか、実際の現場の意見も聞きたいです。@managerさん'
             WHEN 7 THEN 'コスト管理について、効率的な運用方法を検討します。食材コストと人件費のバランス、どう取っていくか、みんなで考えましょう'
             WHEN 8 THEN 'ターゲット顧客層について、改めて確認したいです。20代〜40代のビジネスパーソンで良いか、みんなの意見を聞かせてください'
             WHEN 9 THEN '店舗の雰囲気作りについて、落ち着いた高級感とカジュアルさのバランスをどう取るか、議論しましょう。お客様にどんな体験を提供したいか、明確にしたいです'
             WHEN 10 THEN 'リピーター獲得のための施策について、何か考えていますか？お客様にまた来店してもらうため、どんな工夫ができるか、アイデアを出し合いましょう'
             WHEN 11 THEN '開店後のプロモーション計画について、意見交換しましょう。初日だけでなく、継続的に来店してもらうための戦略が必要ですね'
             ELSE '品質管理について、基準を明確にしていきましょう。お客様に常に最高の料理を提供するため、チェック体制をどう作るか、意見をください'
         END,
         ('2025-01-' || LPAD(LEAST(31, 10 + (i / 2))::TEXT, 2, '0') || ' ' || 
         LPAD((9 + (i % 10))::TEXT, 2, '0') || ':' || 
         LPAD((i * 4 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
        ON CONFLICT (id) DO NOTHING;
        disc_counter := disc_counter + 1;
        
        -- 各親コメントに3-5個の返信を追加
        FOR j IN 1..(3 + (random() * 3)::INTEGER) LOOP
            INSERT INTO discussion_comments (id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
            ('newstore_disc_reply_' || LPAD(disc_reply_counter::TEXT, 3, '0'), new_store_project_id,
             CASE (disc_reply_counter % 4) WHEN 0 THEN yoshito111_user_id WHEN 1 THEN itagawa_user_id WHEN 2 THEN design_user_id ELSE manager_user_id END,
             CASE (disc_reply_counter % 4) WHEN 0 THEN 'yoshito111' WHEN 1 THEN 'itagawa' WHEN 2 THEN 'design' ELSE 'manager' END,
             CASE (disc_reply_counter % 15)
                 WHEN 0 THEN 'コンセプトについては、「モダン和食」という方向性で良いと思います。お客様に新鮮さと親しみやすさを同時に感じてもらえそうです。この方向で進めましょう'
                 WHEN 1 THEN 'メニュー開発、オリジナリティと季節感の両立は難しいですが、@itagawaさんのアイデアがあれば実現できそうですね。試食会が楽しみです。進捗共有お願いします'
                 WHEN 2 THEN '内装デザインの雰囲気、みんなでイメージを共有できて良かったです。木材と金属の組み合わせ、和モダンな雰囲気が出ていて素晴らしいと思います。@designさん、詳細聞かせてください'
                 WHEN 3 THEN 'マーケティング戦略、SNSと従来の広告のバランスが重要ですね。ターゲット層に合わせて、効果的なチャネルに投資しましょう。@managerさん、データも共有しますね'
                 WHEN 4 THEN 'オープニングイベントのアイデア、いくつか出てきましたね。初日から多くのお客様に来店してもらえる企画にしましょう。詳細を詰めていきましょうか'
                 WHEN 5 THEN 'スタッフ教育プログラム、接客と料理知識の両方を重視するのは良いですね。お客様に最高の体験を提供できるチームを作りましょう。内容確認しますね'
                 WHEN 6 THEN 'コスト管理、食材コストと人件費のバランスは重要ですね。利益を確保しつつ、質を落とさない運用を考えましょう。月次で見直ししましょうか'
                 WHEN 7 THEN 'ターゲット層、20代〜40代のビジネスパーソンで良いと思います。この層にアピールできるメニューと雰囲気作りを心がけましょう。マーケティングもこの層に合わせますね'
                 WHEN 8 THEN '店舗の雰囲気、落ち着いた高級感とカジュアルさのバランス、難しいですが重要ですね。お客様がリラックスできる空間にしましょう。@designさん、検討お願いします'
                 WHEN 9 THEN 'リピーター獲得の施策、重要ですね。初回のお客様にまた来店してもらうため、体験価値を高めましょう。会員制度も検討できますね'
                 WHEN 10 THEN '開店後のプロモーション、継続的な来店を促す戦略が必要ですね。季節ごとの企画やイベントも検討しましょう。月替わりメニューも効果的そうです'
                 WHEN 11 THEN '品質管理の基準、明確にできて良かったです。お客様に常に最高の料理を提供できる体制を整えましょう。チェックシートも作成しましょうか'
                 WHEN 12 THEN 'みんなの意見が集まって、方向性が明確になってきました。この調子で進めていきましょう！チーム一丸となって頑張りましょう'
                 WHEN 13 THEN '追加の視点として、顧客フィードバックをどう集めて活かすか、開店後も重要ですね。仕組みを作っておきましょう。アンケートも検討しますね'
                 ELSE '実装可能性について、もう少し検討が必要かもしれませんが、基本的な方向性は良いと思います。詳細を詰めていきましょう。みんなで協力して、素晴らしい店舗を作りましょう！'
             END,
             'newstore_disc_' || LPAD((disc_counter - 1)::TEXT, 3, '0'),
             ('2025-01-' || LPAD(LEAST(31, 10 + (i / 2) + 1)::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (j % 8))::TEXT, 2, '0') || ':' || 
             LPAD((disc_reply_counter * 5 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (id) DO NOTHING;
            disc_reply_counter := disc_reply_counter + 1;
        END LOOP;
    END LOOP;

    -- ============================================
    -- 意見交換コメントにリアクションを追加
    -- ============================================
    
    -- 親コメントと返信の両方にリアクションを追加
    -- 各コメントに対して、2-4人のユーザーが異なるリアクションを追加
    
    -- 親コメントにリアクションを追加
    -- コメント作成者以外からリアクションするユーザーを選択
    FOR i IN 1..(disc_counter - 1) LOOP
        disc_comment_id := 'newstore_disc_' || LPAD(i::TEXT, 3, '0');
        
        -- 親コメントの作成者を取得（i % 4 で決まる）
        comment_author_id := CASE (i % 4) 
            WHEN 0 THEN yoshito111_user_id 
            WHEN 1 THEN itagawa_user_id 
            WHEN 2 THEN design_user_id 
            ELSE manager_user_id 
        END;
        
        -- 作成者以外のユーザーリストを作成
        available_users := ARRAY[]::UUID[];
        IF comment_author_id != yoshito111_user_id THEN 
            available_users := array_append(available_users, yoshito111_user_id); 
        END IF;
        IF comment_author_id != itagawa_user_id THEN 
            available_users := array_append(available_users, itagawa_user_id); 
        END IF;
        IF comment_author_id != design_user_id THEN 
            available_users := array_append(available_users, design_user_id); 
        END IF;
        IF comment_author_id != manager_user_id THEN 
            available_users := array_append(available_users, manager_user_id); 
        END IF;
        
        -- 各コメントに2-4個のリアクションを追加（作成者以外から）
        reaction_count := 2 + (random() * 3)::INTEGER;
        FOR j IN 1..reaction_count LOOP
            -- 作成者以外のユーザーからランダムに選択
            author_index := 1 + (random() * array_length(available_users, 1))::INTEGER;
            reaction_user_id := available_users[author_index];
            -- ランダムにリアクションタイプを選択
            reaction_type := reaction_types[1 + (random() * 6)::INTEGER];
            
            INSERT INTO comment_reactions (id, comment_id, comment_type, user_id, reaction, project_id, created_at) VALUES
            (gen_random_uuid(), disc_comment_id, 'discussion_comment', reaction_user_id, reaction_type, new_store_project_id,
             ('2025-01-' || LPAD(LEAST(31, 15 + (reaction_counter / 10))::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (reaction_counter % 10))::TEXT, 2, '0') || ':' || 
             LPAD((reaction_counter * 3 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (comment_id, comment_type, user_id, reaction) DO NOTHING;
            
            reaction_counter := reaction_counter + 1;
        END LOOP;
    END LOOP;

    -- 返信コメントにリアクションを追加
    -- コメント作成者以外からリアクションするユーザーを選択
    FOR i IN 1..(disc_reply_counter - 1) LOOP
        disc_comment_id := 'newstore_disc_reply_' || LPAD(i::TEXT, 3, '0');
        
        -- 返信コメントの作成者を取得（i % 4 で決まる）
        reply_author_id := CASE (i % 4) 
            WHEN 0 THEN yoshito111_user_id 
            WHEN 1 THEN itagawa_user_id 
            WHEN 2 THEN design_user_id 
            ELSE manager_user_id 
        END;
        
        -- 作成者以外のユーザーリストを作成
        available_users := ARRAY[]::UUID[];
        IF reply_author_id != yoshito111_user_id THEN 
            available_users := array_append(available_users, yoshito111_user_id); 
        END IF;
        IF reply_author_id != itagawa_user_id THEN 
            available_users := array_append(available_users, itagawa_user_id); 
        END IF;
        IF reply_author_id != design_user_id THEN 
            available_users := array_append(available_users, design_user_id); 
        END IF;
        IF reply_author_id != manager_user_id THEN 
            available_users := array_append(available_users, manager_user_id); 
        END IF;
        
        -- 各コメントに2-4個のリアクションを追加（作成者以外から）
        reaction_count := 2 + (random() * 3)::INTEGER;
        FOR j IN 1..reaction_count LOOP
            -- 作成者以外のユーザーからランダムに選択
            author_index := 1 + (random() * array_length(available_users, 1))::INTEGER;
            reaction_user_id := available_users[author_index];
            -- ランダムにリアクションタイプを選択
            reaction_type := reaction_types[1 + (random() * 6)::INTEGER];
            
            INSERT INTO comment_reactions (id, comment_id, comment_type, user_id, reaction, project_id, created_at) VALUES
            (gen_random_uuid(), disc_comment_id, 'discussion_comment', reaction_user_id, reaction_type, new_store_project_id,
             ('2025-01-' || LPAD(LEAST(31, 15 + (reaction_counter / 10))::TEXT, 2, '0') || ' ' || 
             LPAD((10 + (reaction_counter % 10))::TEXT, 2, '0') || ':' || 
             LPAD((reaction_counter * 3 % 60)::TEXT, 2, '0') || ':00+00')::timestamp with time zone)
            ON CONFLICT (comment_id, comment_type, user_id, reaction) DO NOTHING;
            
            reaction_counter := reaction_counter + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE '新店舗出展計画 2025 プロジェクトに自然なディスカッション形式のコメントと意見交換を追加しました';
    RAISE NOTICE '追加されたコメント数: タスクコメント親約 %, 返信約 %, 意見交換親約 %, 返信約 %, リアクション約 %', 
        comment_counter - 1, reply_counter - 1, disc_counter - 1, disc_reply_counter - 1, reaction_counter - 1;
END $$;
