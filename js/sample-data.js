// サンプルデータ（OEM開発プロジェクト用）

// サンプルタスクデータ（OEM完成までのロードマップ）
const sampleTasks = [
    {
        id: 'task-1',
        title: '市場調査・ニーズ分析',
        description: 'ターゲット市場の調査と顧客ニーズの分析を行い、OEM商品の方向性を決定する',
        status: 'completed',
        priority: 'high',
        deadline: '2025-10-15',
        created_at: '2025-10-01T09:00:00Z',
        updated_at: '2025-10-15T17:00:00Z',
        created_by_email: 'manager@oem-restaurant.local'
    },
    {
        id: 'task-2',
        title: '原材料の選定・調達',
        description: '品質基準に合致する原材料の選定と安定供給体制の構築',
        status: 'in_progress',
        priority: 'high',
        deadline: '2025-10-25',
        created_at: '2025-10-02T09:00:00Z',
        updated_at: '2025-10-20T14:30:00Z',
        created_by_email: 'procurement@oem-restaurant.local'
    },
    {
        id: 'task-3',
        title: 'レシピ開発・試作',
        description: 'OEM商品のレシピ開発と試作品の作成・評価',
        status: 'in_progress',
        priority: 'high',
        deadline: '2025-11-05',
        created_at: '2025-10-03T09:00:00Z',
        updated_at: '2025-10-22T16:45:00Z',
        created_by_email: 'chef@oem-restaurant.local'
    },
    {
        id: 'task-4',
        title: '品質管理基準設定',
        description: 'OEM商品の品質管理基準とチェックリストの策定',
        status: 'pending',
        priority: 'medium',
        deadline: '2025-11-10',
        created_at: '2025-10-04T09:00:00Z',
        updated_at: '2025-10-04T09:00:00Z',
        created_by_email: 'quality@oem-restaurant.local'
    },
    {
        id: 'task-5',
        title: '製造ライン設計',
        description: '効率的な製造ラインの設計と設備配置の最適化',
        status: 'pending',
        priority: 'high',
        deadline: '2025-11-15',
        created_at: '2025-10-05T09:00:00Z',
        updated_at: '2025-10-05T09:00:00Z',
        created_by_email: 'production@oem-restaurant.local'
    },
    {
        id: 'task-6',
        title: 'パッケージング設計',
        description: 'OEM商品のパッケージデザインと梱包仕様の決定',
        status: 'pending',
        priority: 'medium',
        deadline: '2025-11-20',
        created_at: '2025-10-06T09:00:00Z',
        updated_at: '2025-10-06T09:00:00Z',
        created_by_email: 'design@oem-restaurant.local'
    },
    {
        id: 'task-7',
        title: '品質テスト・検証',
        description: '完成品の品質テストと顧客満足度の検証',
        status: 'pending',
        priority: 'high',
        deadline: '2025-11-25',
        created_at: '2025-10-07T09:00:00Z',
        updated_at: '2025-10-07T09:00:00Z',
        created_by_email: 'testing@oem-restaurant.local'
    },
    {
        id: 'task-8',
        title: '出荷プロセス構築',
        description: '効率的な出荷プロセスと物流システムの構築',
        status: 'pending',
        priority: 'medium',
        deadline: '2025-11-30',
        created_at: '2025-10-08T09:00:00Z',
        updated_at: '2025-10-08T09:00:00Z',
        created_by_email: 'logistics@oem-restaurant.local'
    },
    {
        id: 'task-9',
        title: 'マーケティング準備',
        description: 'OEM商品のマーケティング戦略と販促資料の準備',
        status: 'pending',
        priority: 'low',
        deadline: '2025-12-05',
        created_at: '2025-10-09T09:00:00Z',
        updated_at: '2025-10-09T09:00:00Z',
        created_by_email: 'marketing@oem-restaurant.local'
    },
    {
        id: 'task-10',
        title: '最終品質確認・納品開始',
        description: '最終品質確認と顧客への納品開始',
        status: 'pending',
        priority: 'high',
        deadline: '2025-12-10',
        created_at: '2025-10-10T09:00:00Z',
        updated_at: '2025-10-10T09:00:00Z',
        created_by_email: 'final@oem-restaurant.local'
    }
];

// サンプルコメントデータ（仮想のコメント）
const sampleComments = [
    {
        id: 'comment-1',
        task_id: 'task-1',
        author_id: 'user-1',
        author_email: 'manager@oem-restaurant.local',
        content: '市場調査が完了しました。ターゲット顧客のニーズが明確になりました。',
        created_at: '2025-10-15T10:30:00Z'
    },
    {
        id: 'comment-2',
        task_id: 'task-1',
        author_id: 'user-2',
        author_email: 'analyst@oem-restaurant.local',
        content: '競合他社の分析結果を共有します。差別化ポイントが見えてきました。',
        created_at: '2025-10-15T14:20:00Z'
    },
    {
        id: 'comment-3',
        task_id: 'task-2',
        author_id: 'user-3',
        author_email: 'procurement@oem-restaurant.local',
        content: '原材料のサンプルを複数業者から取得しました。品質比較を開始します。',
        created_at: '2025-10-20T09:15:00Z'
    },
    {
        id: 'comment-4',
        task_id: 'task-2',
        author_id: 'user-4',
        author_email: 'quality@oem-restaurant.local',
        content: '原材料の品質基準を設定しました。コストと品質のバランスを検討中です。',
        created_at: '2025-10-21T11:45:00Z'
    },
    {
        id: 'comment-5',
        task_id: 'task-3',
        author_id: 'user-5',
        author_email: 'chef@oem-restaurant.local',
        content: 'レシピの第一版が完成しました。試作品の味見を実施予定です。',
        created_at: '2025-10-22T16:30:00Z'
    },
    {
        id: 'comment-6',
        task_id: 'task-3',
        author_id: 'user-6',
        author_email: 'taster@oem-restaurant.local',
        content: '試作品の味見結果を共有します。調整が必要な点がいくつかあります。',
        created_at: '2025-10-23T13:20:00Z'
    },
    {
        id: 'comment-7',
        task_id: 'task-4',
        author_id: 'user-7',
        author_email: 'quality@oem-restaurant.local',
        content: '品質管理基準の草案を作成しました。レビューをお願いします。',
        created_at: '2025-10-24T10:00:00Z'
    },
    {
        id: 'comment-8',
        task_id: 'task-5',
        author_id: 'user-8',
        author_email: 'production@oem-restaurant.local',
        content: '製造ラインの設計図を作成中です。効率性を重視したレイアウトを検討しています。',
        created_at: '2025-10-25T14:15:00Z'
    },
    {
        id: 'comment-9',
        task_id: 'task-6',
        author_id: 'user-9',
        author_email: 'design@oem-restaurant.local',
        content: 'パッケージデザインのコンセプトを検討中です。ブランドイメージを重視します。',
        created_at: '2025-10-26T09:30:00Z'
    },
    {
        id: 'comment-10',
        task_id: 'task-7',
        author_id: 'user-10',
        author_email: 'testing@oem-restaurant.local',
        content: '品質テストの計画を策定しました。包括的なテスト項目を準備中です。',
        created_at: '2025-10-27T11:45:00Z'
    },
    {
        id: 'comment-11',
        task_id: 'task-8',
        author_id: 'user-11',
        author_email: 'logistics@oem-restaurant.local',
        content: '出荷プロセスの効率化を検討中です。自動化できる部分を特定しています。',
        created_at: '2025-10-28T15:20:00Z'
    },
    {
        id: 'comment-12',
        task_id: 'task-9',
        author_id: 'user-12',
        author_email: 'marketing@oem-restaurant.local',
        content: 'マーケティング戦略の方向性を検討中です。ターゲット層に合わせたアプローチを計画しています。',
        created_at: '2025-10-29T10:30:00Z'
    },
    {
        id: 'comment-13',
        task_id: 'task-10',
        author_id: 'user-13',
        author_email: 'final@oem-restaurant.local',
        content: '最終品質確認の準備を開始しました。全工程のチェックリストを作成中です。',
        created_at: '2025-10-30T16:00:00Z'
    },
    {
        id: 'comment-14',
        task_id: 'task-1',
        author_id: 'user-14',
        author_email: 'stakeholder@oem-restaurant.local',
        content: '市場調査の結果を基に、プロジェクトの方向性を再確認しました。',
        created_at: '2025-10-31T09:15:00Z'
    },
    {
        id: 'comment-15',
        task_id: 'task-2',
        author_id: 'user-15',
        author_email: 'supplier@oem-restaurant.local',
        content: '原材料の調達先との交渉が進んでいます。価格と品質のバランスを重視しています。',
        created_at: '2025-11-01T14:45:00Z'
    },
    {
        id: 'comment-16',
        task_id: 'task-3',
        author_id: 'user-16',
        author_email: 'nutritionist@oem-restaurant.local',
        content: '栄養価の分析結果を共有します。健康志向の顧客にアピールできる要素があります。',
        created_at: '2025-11-02T11:20:00Z'
    },
    {
        id: 'comment-17',
        task_id: 'task-4',
        author_id: 'user-17',
        author_email: 'compliance@oem-restaurant.local',
        content: '品質管理基準の法的要件を確認しました。規制に準拠した基準を設定します。',
        created_at: '2025-11-03T13:30:00Z'
    },
    {
        id: 'comment-18',
        task_id: 'task-5',
        author_id: 'user-18',
        author_email: 'engineer@oem-restaurant.local',
        content: '製造ラインの技術仕様を検討中です。最新の設備導入を検討しています。',
        created_at: '2025-11-04T15:45:00Z'
    },
    {
        id: 'comment-19',
        task_id: 'task-6',
        author_id: 'user-19',
        author_email: 'sustainability@oem-restaurant.local',
        content: '環境に配慮したパッケージング素材を検討しています。持続可能性を重視します。',
        created_at: '2025-11-05T10:15:00Z'
    },
    {
        id: 'comment-20',
        task_id: 'task-7',
        author_id: 'user-20',
        author_email: 'safety@oem-restaurant.local',
        content: '安全性テストの計画を策定しました。食品衛生基準を満たす設計にします。',
        created_at: '2025-11-06T12:30:00Z'
    },
    {
        id: 'comment-21',
        task_id: 'task-8',
        author_id: 'user-21',
        author_email: 'warehouse@oem-restaurant.local',
        content: '倉庫管理システムの最適化を検討中です。在庫管理の効率化を図ります。',
        created_at: '2025-11-07T14:20:00Z'
    },
    {
        id: 'comment-22',
        task_id: 'task-9',
        author_id: 'user-22',
        author_email: 'brand@oem-restaurant.local',
        content: 'ブランド戦略の方向性を検討中です。差別化ポイントを明確にします。',
        created_at: '2025-11-08T16:45:00Z'
    },
    {
        id: 'comment-23',
        task_id: 'task-10',
        author_id: 'user-23',
        author_email: 'delivery@oem-restaurant.local',
        content: '納品スケジュールの調整を行っています。顧客の要求に柔軟に対応します。',
        created_at: '2025-11-09T09:30:00Z'
    }
];

// サンプル会議データ
const sampleMeetings = [
    {
        id: 'meeting-1',
        title: 'OEM開発プロジェクト キックオフ会議',
        startTime: '2025-10-15T10:00:00Z',
        duration: 90,
        participants: ['manager@oem-restaurant.local', 'chef@oem-restaurant.local', 'procurement@oem-restaurant.local'],
        meetUrl: 'https://meet.google.com/abc-defg-hij',
        status: 'scheduled',
        createdAt: '2025-10-01T09:00:00Z'
    },
    {
        id: 'meeting-2',
        title: '原材料選定 検討会議',
        startTime: '2025-10-25T14:00:00Z',
        duration: 60,
        participants: ['procurement@oem-restaurant.local', 'quality@oem-restaurant.local', 'chef@oem-restaurant.local'],
        meetUrl: 'https://meet.google.com/xyz-uvwx-rst',
        status: 'scheduled',
        createdAt: '2025-10-20T10:30:00Z'
    },
    {
        id: 'meeting-3',
        title: 'レシピ開発 進捗報告会',
        startTime: '2025-11-05T11:00:00Z',
        duration: 45,
        participants: ['chef@oem-restaurant.local', 'taster@oem-restaurant.local', 'nutritionist@oem-restaurant.local'],
        meetUrl: 'https://meet.google.com/mno-pqrs-tuv',
        status: 'scheduled',
        createdAt: '2025-10-22T15:45:00Z'
    },
    {
        id: 'meeting-4',
        title: '品質管理基準 レビュー会議',
        startTime: '2025-11-10T15:00:00Z',
        duration: 75,
        participants: ['quality@oem-restaurant.local', 'compliance@oem-restaurant.local', 'safety@oem-restaurant.local'],
        meetUrl: 'https://meet.google.com/ghi-jklm-nop',
        status: 'scheduled',
        createdAt: '2025-10-24T11:20:00Z'
    },
    {
        id: 'meeting-5',
        title: '最終品質確認 準備会議',
        startTime: '2025-12-05T09:00:00Z',
        duration: 120,
        participants: ['final@oem-restaurant.local', 'testing@oem-restaurant.local', 'delivery@oem-restaurant.local'],
        meetUrl: 'https://meet.google.com/qrs-tuvw-xyz',
        status: 'scheduled',
        createdAt: '2025-10-30T16:00:00Z'
    }
];

// サンプルデータの初期化（localStorage未使用版）
// 注意: このアプリはSupabaseをデータストレージとして使用し、localStorageは一切使用しません
function initializeSampleData() {
    console.log('サンプルデータ機能は無効化されています');
    console.log('データはSupabaseデータベースに保存されます');
    console.log('サンプルデータはマイグレーションファイルから自動的に読み込まれます');
    console.log('参照: supabase/migrations/20251020_0001_init.sql');
}

// サンプルデータのリセット（手動用）
function resetSampleData() {
    console.log('サンプルデータのリセットは無効化されています');
    console.log('データベースをリセットするには、Supabaseのマイグレーションを再実行してください');
}

// グローバル関数として公開
window.initializeSampleData = initializeSampleData;
window.resetSampleData = resetSampleData;
