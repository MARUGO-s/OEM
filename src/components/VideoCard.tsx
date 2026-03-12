import { Link } from 'react-router-dom';
import type { Video } from '../data/mockVideos';
import './VideoCard.css';

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  return (
    <Link to={`/watch/${video.id}`} className="video-card">
      <div className="video-thumbnail-container">
        <img src={video.thumbnailUrl} alt={video.title} className="video-thumbnail" loading="lazy" />
        <span className="video-duration">{video.duration}</span>
      </div>
      <div className="video-info">
        <div className="video-avatar">
          {video.department.charAt(0)}
        </div>
        <div className="video-details">
          <h3 className="video-title" title={video.title}>{video.title}</h3>
          <div className="video-meta">
            <span className="video-department">{video.department}</span>
            <div className="video-stats">
              <span>{video.views.toLocaleString()} 回視聴</span>
              <span className="separator">•</span>
              <span>{video.uploadedAt}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
