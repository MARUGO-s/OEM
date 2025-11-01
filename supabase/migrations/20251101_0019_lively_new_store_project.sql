-- 新店舗出展計画 2025 プロジェクトの活発なサンプルデータ
-- リアクション、返信、意見交換を含む充実したデータを挿入

-- 1. 「新店舗出展計画 2025」プロジェクトを作成
-- 既存のプロジェクトIDがある場合はスキップ
DO $$
DECLARE
    new_store_project_id UUID;
    yoshito111_user_id UUID;
    itagawa_user_id UUID;
    design_user_id UUID;
    manager_user_id UUID;
BEGIN
    -- yoshito111ユーザーを取得または作成
    SELECT id INTO yoshito111_user_id FROM user_profiles WHERE username = 'yoshito111' LIMIT 1;
    IF yoshito111_user_id IS NULL THEN
        INSERT INTO user_profiles (username, display_name, email) 
        VALUES ('yoshito111', 'よしと', 'yoshito111@example.com')
        RETURNING id INTO yoshito111_user_id;
    END IF;

    -- プロジェクトが既に存在するかチェック
    SELECT id INTO new_store_project_id FROM projects WHERE name = '新店舗出展計画 2025' LIMIT 1;
    
    IF new_store_project_id IS NULL THEN
        -- プロジェクトを作成
        INSERT INTO projects (name, description, created_by)
        VALUES (
            '新店舗出展計画 2025',
            '東京駅前エリアでの新店舗出展に向けた包括的なプロジェクト。立地選定から内装設計、開店準備までを管理。',
            yoshito111_user_id
        )
        RETURNING id INTO new_store_project_id;

        -- 他のユーザーを取得
        SELECT id INTO itagawa_user_id FROM user_profiles WHERE username = 'itagawa' LIMIT 1;
        IF itagawa_user_id IS NULL THEN
            INSERT INTO user_profiles (username, display_name, email) 
            VALUES ('itagawa', '板川', 'itagawa@example.com')
            RETURNING id INTO itagawa_user_id;
        END IF;

        SELECT id INTO design_user_id FROM user_profiles WHERE username = 'design' LIMIT 1;
        IF design_user_id IS NULL THEN
            INSERT INTO user_profiles (username, display_name, email) 
            VALUES ('design', 'デザイナー', 'design@example.com')
            RETURNING id INTO design_user_id;
        END IF;

        SELECT id INTO manager_user_id FROM user_profiles WHERE username = 'manager' LIMIT 1;
        IF manager_user_id IS NULL THEN
            INSERT INTO user_profiles (username, display_name, email) 
            VALUES ('manager', 'マネージャー', 'manager@example.com')
            RETURNING id INTO manager_user_id;
        END IF;

        -- プロジェクトメンバーを追加
        INSERT INTO project_members (project_id, user_id, role) VALUES
        (new_store_project_id, yoshito111_user_id, 'owner'),
        (new_store_project_id, itagawa_user_id, 'member'),
        (new_store_project_id, design_user_id, 'member'),
        (new_store_project_id, manager_user_id, 'admin')
        ON CONFLICT (project_id, user_id) DO NOTHING;

        -- 2. タスクを挿入
        INSERT INTO tasks (id, title, description, status, priority, deadline, project_id, display_order, created_by, created_at, updated_at) VALUES
        ('newstore_task_001', '出展場所の最終選定', '東京駅前の3候補から最適な物件を選定。家賃、立地、客層、競合を総合的に評価し、収益性の高い物件を選定する', 'completed', 'high', '2025-01-15', new_store_project_id, 1, yoshito111_user_id, '2025-01-10 09:00:00+00', '2025-01-15 18:00:00+00'),
        ('newstore_task_002', '店舗デザイン・内装設計', '"モダン和食"をテーマにした店舗デザインと内装工事の設計・発注。木材と金属を組み合わせたスタイリッシュな空間を創出', 'in_progress', 'high', '2025-02-10', new_store_project_id, 2, design_user_id, '2025-01-11 10:00:00+00', '2025-01-26 15:30:00+00'),
        ('newstore_task_003', '厨房機器選定・発注', '新店舗に必要な厨房機器一式の選定と発注。効率性と安全性を最優先に、予算内で最高品質の機器を選択', 'pending', 'high', '2025-02-20', new_store_project_id, 3, yoshito111_user_id, '2025-01-12 09:30:00+00', '2025-01-12 09:30:00+00'),
        ('newstore_task_004', 'メニュー開発・試作', '新店舗オリジナルメニューの開発と試作。和のエッセンスをモダンにアレンジした独自性の高い料理を考案', 'pending', 'high', '2025-02-25', new_store_project_id, 4, itagawa_user_id, '2025-01-13 11:00:00+00', '2025-01-13 11:00:00+00'),
        ('newstore_task_005', '人員採用・教育計画', 'シェフ、ホールスタッフの採用と教育プログラム策定。新店舗のコンセプトを正しく伝えられる人材を確保', 'pending', 'medium', '2025-03-05', new_store_project_id, 5, manager_user_id, '2025-01-14 10:00:00+00', '2025-01-14 10:00:00+00'),
        ('newstore_task_006', '広告・オープニング準備', '新店舗の広告戦略とオープニングイベントの企画。SNSマーケティング、プレスリリース、初日イベントを準備', 'pending', 'medium', '2025-03-15', new_store_project_id, 6, yoshito111_user_id, '2025-01-15 09:00:00+00', '2025-01-15 09:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        -- 3. タスクコメント（親コメント）を挿入
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_comment_001', 'newstore_task_001', new_store_project_id, manager_user_id, 'manager', '物件Aに決定しました。駅直結で客層も良好です。賃料は月150万円で交渉成立しました', '2025-01-15 14:00:00+00'),
        ('newstore_comment_002', 'newstore_task_001', new_store_project_id, yoshito111_user_id, 'yoshito111', '素晴らしい!立地が最高ですね。次は内装デザインに注力しましょう', '2025-01-16 10:30:00+00'),
        ('newstore_comment_003', 'newstore_task_002', new_store_project_id, design_user_id, 'design', 'モダン和食のコンセプトデザインを3案作成中です。来週プレゼンします', '2025-01-25 16:45:00+00'),
        ('newstore_comment_004', 'newstore_task_002', new_store_project_id, itagawa_user_id, 'itagawa', '楽しみにしています!木材と金属のコントラストを効かせたデザインが良いと思います', '2025-01-26 11:20:00+00'),
        ('newstore_comment_005', 'newstore_task_003', new_store_project_id, manager_user_id, 'manager', '厨房機器の業者3社から見積もりを取得しました。予算内で最高の性能を選びます', '2025-01-28 09:15:00+00'),
        ('newstore_comment_006', 'newstore_task_004', new_store_project_id, itagawa_user_id, 'itagawa', 'オリジナルメニューのアイデアが出揃いました。来週試作を開始します', '2025-01-29 14:00:00+00'),
        ('newstore_comment_007', 'newstore_task_005', new_store_project_id, yoshito111_user_id, 'yoshito111', 'シェフの採用が順調です。来月から教育プログラムを開始できます', '2025-01-30 10:30:00+00'),
        ('newstore_comment_008', 'newstore_task_006', new_store_project_id, design_user_id, 'design', 'オープニング広告のデザイン案を3パターン準備中です。来週レビューします', '2025-01-31 15:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        -- 4. タスクコメント（返信）を挿入 - 活発な議論を再現
        INSERT INTO task_comments (id, task_id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
        -- 物件決定への返信
        ('newstore_reply_001', 'newstore_task_001', new_store_project_id, itagawa_user_id, 'itagawa', 'ありがとうございます!駅直結は集客の面で大きなアドバンテージですね。早速内装設計に進めます', 'newstore_comment_001', '2025-01-15 16:30:00+00'),
        ('newstore_reply_002', 'newstore_task_001', new_store_project_id, design_user_id, 'design', '物件A、素晴らしい選択だと思います。周辺の競合店も調査しましたが、十分差別化できます', 'newstore_comment_001', '2025-01-16 09:00:00+00'),
        
        -- 内装デザインについての活発な議論
        ('newstore_reply_003', 'newstore_task_002', new_store_project_id, yoshito111_user_id, 'yoshito111', 'どの案も素晴らしいです!特に案Bの照明計画が気に入っています', 'newstore_comment_003', '2025-01-26 09:30:00+00'),
        ('newstore_reply_004', 'newstore_task_002', new_store_project_id, manager_user_id, 'manager', '私も案Bに一票です。コストパフォーマンスも優秀です', 'newstore_comment_003', '2025-01-26 14:15:00+00'),
        ('newstore_reply_005', 'newstore_task_002', new_store_project_id, design_user_id, 'design', 'ありがとうございます! 案Bをベースにさらに詰めます。材料選定も含めて来週詳細を共有します', 'newstore_reply_003', '2025-01-27 10:00:00+00'),
        
        -- メニュー開発の議論
        ('newstore_reply_006', 'newstore_task_004', new_store_project_id, yoshito111_user_id, 'yoshito111', '楽しみです!特に季節感を大切にしたメニューに期待しています', 'newstore_comment_006', '2025-01-30 11:15:00+00'),
        ('newstore_reply_007', 'newstore_task_004', new_store_project_id, manager_user_id, 'manager', '食材の調達先も早めに確保しましょう。地域のこだわり農家さんとの提携も検討中です', 'newstore_comment_006', '2025-01-30 16:45:00+00'),
        ('newstore_reply_008', 'newstore_task_004', new_store_project_id, itagawa_user_id, 'itagawa', '了解しました!来週、主要食材のサンプルを取り寄せます。味と見た目の両方を重視します', 'newstore_reply_007', '2025-01-31 09:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        -- 5. 意見交換コメント（親コメント）を挿入 - 活発な議論を再現
        INSERT INTO discussion_comments (id, project_id, author_id, author_username, content, created_at) VALUES
        ('newstore_disc_001', new_store_project_id, yoshito111_user_id, 'yoshito111', '新店舗のコンセプトを固めましょう。皆さんのアイデアを聞かせてください', '2025-01-10 10:00:00+00'),
        ('newstore_disc_002', new_store_project_id, design_user_id, 'design', '夜の雰囲気を大切にしたいです。間接照明を多用した落ち着いた空間はどうでしょう?', '2025-01-11 14:30:00+00'),
        ('newstore_disc_003', new_store_project_id, itagawa_user_id, 'itagawa', '季節の食材を使った限定メニューを毎月リリースできれば、リピーター獲得に効果的だと思います', '2025-01-12 11:00:00+00'),
        ('newstore_disc_004', new_store_project_id, manager_user_id, 'manager', 'コスト管理も重要ですが、品質は妥協したくありません。バランスを取った運用を考えましょう', '2025-01-13 09:15:00+00'),
        ('newstore_disc_005', new_store_project_id, yoshito111_user_id, 'yoshito111', 'SNSマーケティングの強化案です。InstagramやTikTokでの発信を積極的に行います', '2025-01-14 16:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        -- 6. 意見交換コメント（返信）を挿入
        INSERT INTO discussion_comments (id, project_id, author_id, author_username, content, parent_id, created_at) VALUES
        -- コンセプトについて
        ('newstore_disc_reply_001', new_store_project_id, itagawa_user_id, 'itagawa', 'モダン和食というコンセプト、とても良いと思います。伝統と革新のバランスが大切ですね', 'newstore_disc_001', '2025-01-10 14:00:00+00'),
        ('newstore_disc_reply_002', new_store_project_id, design_user_id, 'design', '空間デザインもそれに合わせて、和モダンを追求します。よろしくお願いします!', 'newstore_disc_001', '2025-01-11 10:30:00+00'),
        
        -- 照明について
        ('newstore_disc_reply_003', new_store_project_id, yoshito111_user_id, 'yoshito111', '間接照明で雰囲気を作るのは大事ですね。特に料理が映える照明を心がけましょう', 'newstore_disc_002', '2025-01-12 09:00:00+00'),
        ('newstore_disc_reply_004', new_store_project_id, itagawa_user_id, 'itagawa', '料理の色味が一番映える照明を研究します。シェフの視点からも意見させてください', 'newstore_disc_002', '2025-01-12 15:20:00+00'),
        
        -- 季節限定メニューについて
        ('newstore_disc_reply_005', new_store_project_id, manager_user_id, 'manager', '季節限定メニュー、良いアイデアです!プレスリリースにも活用できますね', 'newstore_disc_003', '2025-01-13 10:00:00+00'),
        ('newstore_disc_reply_006', new_store_project_id, yoshito111_user_id, 'yoshito111', 'Instagramでの発信も一緒にやります。ビジュアル重視のメニューを意識しましょう', 'newstore_disc_003', '2025-01-13 16:30:00+00'),
        
        -- コスト管理について
        ('newstore_disc_reply_007', new_store_project_id, design_user_id, 'design', 'コストパフォーマンスの良い材料でも、魅力的な空間は作れます。一緒に選定しましょう', 'newstore_disc_004', '2025-01-14 11:00:00+00'),
        ('newstore_disc_reply_008', new_store_project_id, itagawa_user_id, 'itagawa', '食材も同様です。地域の生産者さんと直接交渉することで、良いものを適正価格で仕入れられます', 'newstore_disc_004', '2025-01-14 15:45:00+00'),
        ('newstore_disc_reply_009', new_store_project_id, yoshito111_user_id, 'yoshito111', '皆さんのアイデアが集まって、具体的な方向性が見えてきました。素晴らしいです', 'newstore_disc_reply_008', '2025-01-15 09:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        -- 7. リアクションを挿入 - 活発な雰囲気を再現
        INSERT INTO comment_reactions (comment_id, comment_type, user_id, reaction, project_id) VALUES
        -- タスクコメントへのリアクション
        ('newstore_comment_001', 'task_comment', yoshito111_user_id, 'celebration', new_store_project_id),
        ('newstore_comment_001', 'task_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_comment_001', 'task_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_comment_002', 'task_comment', manager_user_id, 'rocket', new_store_project_id),
        ('newstore_comment_002', 'task_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_comment_003', 'task_comment', yoshito111_user_id, 'fire', new_store_project_id),
        ('newstore_comment_003', 'task_comment', itagawa_user_id, 'heart', new_store_project_id),
        ('newstore_comment_003', 'task_comment', manager_user_id, 'eyes', new_store_project_id),
        ('newstore_comment_004', 'task_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_comment_005', 'task_comment', yoshito111_user_id, 'rocket', new_store_project_id),
        ('newstore_comment_005', 'task_comment', itagawa_user_id, 'eyes', new_store_project_id),
        ('newstore_comment_006', 'task_comment', yoshito111_user_id, 'fire', new_store_project_id),
        ('newstore_comment_006', 'task_comment', manager_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_comment_006', 'task_comment', design_user_id, 'celebration', new_store_project_id),
        ('newstore_comment_007', 'task_comment', manager_user_id, 'rocket', new_store_project_id),
        ('newstore_comment_008', 'task_comment', yoshito111_user_id, 'eyes', new_store_project_id),
        ('newstore_comment_008', 'task_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        
        -- 返信へのリアクション
        ('newstore_reply_001', 'task_comment', yoshito111_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_reply_002', 'task_comment', yoshito111_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_reply_003', 'task_comment', design_user_id, 'celebration', new_store_project_id),
        ('newstore_reply_003', 'task_comment', itagawa_user_id, 'fire', new_store_project_id),
        ('newstore_reply_004', 'task_comment', yoshito111_user_id, 'rocket', new_store_project_id),
        ('newstore_reply_005', 'task_comment', yoshito111_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_reply_005', 'task_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        
        -- 意見交換コメントへのリアクション
        ('newstore_disc_001', 'discussion_comment', itagawa_user_id, 'celebration', new_store_project_id),
        ('newstore_disc_001', 'discussion_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_001', 'discussion_comment', manager_user_id, 'rocket', new_store_project_id),
        ('newstore_disc_002', 'discussion_comment', yoshito111_user_id, 'fire', new_store_project_id),
        ('newstore_disc_002', 'discussion_comment', itagawa_user_id, 'heart', new_store_project_id),
        ('newstore_disc_003', 'discussion_comment', yoshito111_user_id, 'celebration', new_store_project_id),
        ('newstore_disc_003', 'discussion_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_004', 'discussion_comment', yoshito111_user_id, 'eyes', new_store_project_id),
        ('newstore_disc_004', 'discussion_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_005', 'discussion_comment', itagawa_user_id, 'rocket', new_store_project_id),
        ('newstore_disc_005', 'discussion_comment', design_user_id, 'fire', new_store_project_id),
        ('newstore_disc_005', 'discussion_comment', manager_user_id, 'thumbs_up', new_store_project_id),
        
        -- 意見交換返信へのリアクション
        ('newstore_disc_reply_001', 'discussion_comment', yoshito111_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_reply_001', 'discussion_comment', design_user_id, 'celebration', new_store_project_id),
        ('newstore_disc_reply_002', 'discussion_comment', yoshito111_user_id, 'rocket', new_store_project_id),
        ('newstore_disc_reply_003', 'discussion_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_reply_003', 'discussion_comment', itagawa_user_id, 'fire', new_store_project_id),
        ('newstore_disc_reply_004', 'discussion_comment', design_user_id, 'eyes', new_store_project_id),
        ('newstore_disc_reply_005', 'discussion_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_reply_006', 'discussion_comment', design_user_id, 'rocket', new_store_project_id),
        ('newstore_disc_reply_007', 'discussion_comment', itagawa_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_reply_008', 'discussion_comment', yoshito111_user_id, 'celebration', new_store_project_id),
        ('newstore_disc_reply_008', 'discussion_comment', design_user_id, 'thumbs_up', new_store_project_id),
        ('newstore_disc_reply_009', 'discussion_comment', itagawa_user_id, 'celebration', new_store_project_id),
        ('newstore_disc_reply_009', 'discussion_comment', design_user_id, 'fire', new_store_project_id)
        ON CONFLICT (comment_id, comment_type, user_id, reaction) DO NOTHING;

        -- 8. 会議データを挿入
        INSERT INTO meetings (id, title, start_time, duration, participants, meet_url, status, project_id, created_by, meeting_code, created_at, updated_at) VALUES
        ('newstore_meeting_001', '新店舗プロジェクト キックオフ会議', '2025-01-10 10:00:00+00', 90, ARRAY['yoshito111', 'itagawa', 'design', 'manager'], 'https://meet.google.com/newstore-kickoff-001', 'completed', new_store_project_id, yoshito111_user_id, 'kickoff-001', '2025-01-08 09:00:00+00', '2025-01-10 11:30:00+00'),
        ('newstore_meeting_002', '店舗デザイン プレゼンテーション', '2025-01-27 14:00:00+00', 60, ARRAY['yoshito111', 'itagawa', 'design', 'manager'], 'https://meet.google.com/newstore-design-001', 'scheduled', new_store_project_id, design_user_id, 'design-001', '2025-01-25 10:00:00+00', '2025-01-25 10:00:00+00'),
        ('newstore_meeting_003', 'メニュー試作 テイスティング', '2025-02-05 18:00:00+00', 120, ARRAY['yoshito111', 'itagawa', 'manager'], 'https://meet.google.com/newstore-tasting-001', 'scheduled', new_store_project_id, itagawa_user_id, 'tasting-001', '2025-01-29 15:00:00+00', '2025-01-29 15:00:00+00'),
        ('newstore_meeting_004', '厨房機器 選定会議', '2025-02-18 11:00:00+00', 90, ARRAY['yoshito111', 'itagawa', 'manager'], 'https://meet.google.com/newstore-kitchen-001', 'scheduled', new_store_project_id, manager_user_id, 'kitchen-001', '2025-02-01 09:00:00+00', '2025-02-01 09:00:00+00'),
        ('newstore_meeting_005', 'オープニング準備 最終ミーティング', '2025-03-10 15:00:00+00', 120, ARRAY['yoshito111', 'itagawa', 'design', 'manager'], 'https://meet.google.com/newstore-final-001', 'scheduled', new_store_project_id, yoshito111_user_id, 'final-001', '2025-03-01 10:00:00+00', '2025-03-01 10:00:00+00')
        ON CONFLICT (id) DO NOTHING;

        RAISE NOTICE '新店舗出展計画 2025 プロジェクトのサンプルデータを挿入しました: %', new_store_project_id;
    ELSE
        RAISE NOTICE '新店舗出展計画 2025 プロジェクトは既に存在します: %', new_store_project_id;
    END IF;
END $$;

