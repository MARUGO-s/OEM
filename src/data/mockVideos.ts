export interface Video {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl?: string;
  department: string;
  views: number;
  uploadedAt: string;
  duration: string;
  description: string;
}

export const mockVideos: Video[] = [
  {
    id: "v1",
    title: "【新入社員向け】社内システムの基本操作ガイド",
    thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800",
    department: "人事部・IT部門",
    views: 1250,
    uploadedAt: "2日前",
    duration: "15:20",
    description: "新入社員向けに、経費精算システムや社内ポータルの使い方を解説します。",
  },
  {
    id: "v2",
    title: "2026年度 上期 全社キックオフミーティング（録画）",
    thumbnailUrl: "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=800",
    department: "経営企画室",
    views: 3400,
    uploadedAt: "1週間前",
    duration: "1:20:05",
    description: "社長からのメッセージおよび各事業部の目標説明のまとめ動画です。",
  },
  {
    id: "v3",
    title: "Slackの効率的な活用法とルールについて",
    thumbnailUrl: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=800",
    department: "IT部門",
    views: 890,
    uploadedAt: "3週間前",
    duration: "08:45",
    description: "メンションの使い分けや、チャンネルの作成ルールの共有です。",
  },
  {
    id: "v4",
    title: "【営業部必見】新商材Aのセールスピッチ資料解説",
    thumbnailUrl: "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&q=80&w=800",
    department: "営業推進部",
    views: 560,
    uploadedAt: "1ヶ月前",
    duration: "22:15",
    description: "今期リリースの新商材Aについて、顧客への提案方法をロールプレイ形式で解説します。",
  },
  {
    id: "v5",
    title: "情報セキュリティ研修 2026年版",
    thumbnailUrl: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&q=80&w=800",
    department: "コンプライアンス部",
    views: 4100,
    uploadedAt: "2ヶ月前",
    duration: "45:00",
    description: "全社員必修の情報セキュリティ研修動画です。必ず期日までに視聴してください。",
  },
  {
    id: "v6",
    title: "リモートワーク環境を快適にするデスクセットアップ",
    thumbnailUrl: "https://images.unsplash.com/photo-1593640408182-31c70c8268f5?auto=format&fit=crop&q=80&w=800",
    department: "総務部",
    views: 210,
    uploadedAt: "5日前",
    duration: "12:30",
    description: "肩こりや腰痛を防ぐための正しい座り方と、推奨される機材を紹介します。",
  }
];
