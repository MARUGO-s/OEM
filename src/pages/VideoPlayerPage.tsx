import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal, MessageSquare } from 'lucide-react';
import { mockVideos, type Video } from '../data/mockVideos';
import './VideoPlayerPage.css';

export function VideoPlayerPage() {
  const { videoId } = useParams();
  const [video, setVideo] = useState<Video | null>(null);

  useEffect(() => {
    // Clean up '-dup' if any from mock data for simplification
    const baseId = videoId?.replace('-dup', '');
    const found = mockVideos.find((v) => v.id === baseId);
    setVideo(found || mockVideos[0]);
  }, [videoId]);

  if (!video) return <div className="loading-state">読み込み中...</div>;

  const relatedVideos = mockVideos.filter((v) => v.id !== video.id);

  return (
    <div className="video-player-container">
      <div className="video-main-content">
        <div className="video-player-wrapper glass-panel">
          {/* Mock Video Element */}
          <div className="mock-video-player" style={{ backgroundImage: `url(${video.thumbnailUrl})` }}>
            <div className="play-overlay">
              <div className="play-button-icon">▶</div>
            </div>
            <div className="video-controls-bottom">
              <div className="progress-bar-bg">
                <div className="progress-bar-fg" style={{ width: '30%' }}></div>
              </div>
            </div>
          </div>
        </div>
        
        <h1 className="player-video-title">{video.title}</h1>
        
        <div className="player-video-primary-info">
          <div className="player-channel-info">
            <div className="player-avatar">{video.department.charAt(0)}</div>
            <div className="player-channel-text">
              <div className="player-channel-name">{video.department}</div>
              <div className="player-subscriber-count">社内公式チャンネル</div>
            </div>
            <button className="btn-primary subscribe-btn">チャンネル登録</button>
          </div>
          
          <div className="player-actions">
            <div className="action-button-group">
              <button className="action-button left-action hover-scale">
                <ThumbsUp size={20} /> <span className="action-text">124</span>
              </button>
              <div className="action-divider"></div>
              <button className="action-button right-action hover-scale">
                <ThumbsDown size={20} />
              </button>
            </div>
            <button className="action-button standalone-action hover-scale">
              <Share2 size={20} /> <span className="action-text">共有</span>
            </button>
            <button className="icon-button standalone-action hover-scale">
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
        
        <div className="player-video-description glass-panel">
          <div className="description-stats">
            {video.views.toLocaleString()} 回視聴 • {video.uploadedAt}
          </div>
          <div className="description-content">
            {video.description}
            <br /><br />
            Tags: #社内マニュアル #研修 #{video.department}
          </div>
        </div>

        <div className="comments-section">
          <h2><MessageSquare size={24} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle'}}/> コメント 12件</h2>
          {/* Dummy comments could go here */}
          <div className="comment-input-area">
             <div className="player-avatar" style={{width: 40, height: 40, fontSize: 18}}>自</div>
             <input type="text" placeholder="コメントを追加..." className="comment-input" />
          </div>
        </div>

      </div>
      
      <div className="video-sidebar">
        <div className="related-videos-header">関連するマニュアル動画</div>
        <div className="related-videos-list">
          {relatedVideos.map((rv) => (
            <Link to={`/watch/${rv.id}`} key={rv.id} className="related-video-card">
              <div className="related-thumbnail">
                <img src={rv.thumbnailUrl} alt={rv.title} loading="lazy" />
                <span className="related-duration">{rv.duration}</span>
              </div>
              <div className="related-info">
                <div className="related-title" title={rv.title}>{rv.title}</div>
                <div className="related-department">{rv.department}</div>
                <div className="related-stats">{rv.views.toLocaleString()} 回視聴</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
