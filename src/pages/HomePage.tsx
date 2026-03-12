import { mockVideos } from '../data/mockVideos';
import { VideoCard } from '../components/VideoCard';
import './HomePage.css';

export function HomePage() {
  return (
    <div className="home-page">
      <div className="category-tags">
        <button className="tag-button active">すべて</button>
        <button className="tag-button">新入社員向け</button>
        <button className="tag-button">営業</button>
        <button className="tag-button">開発</button>
        <button className="tag-button">人事・総務</button>
        <button className="tag-button">システム利用</button>
      </div>
      
      <div className="video-grid">
        {mockVideos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
        {/* Duplicate to show more grid items for demonstration */}
        {mockVideos.map((video) => (
          <VideoCard key={video.id + '-dup'} video={{...video, id: video.id + '-dup'}} />
        ))}
      </div>
    </div>
  );
}
