import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  PhoneOff,
  Users,
  FileText,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  Radio,
  ShieldCheck,
  RefreshCw,
  X,
  AlertTriangle,
  Briefcase,
  Clock,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
} from 'livekit-client';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import {
  meetingService,
  type Meeting,
  type TranscriptSegment,
  type TranscriptionQueueStatus,
} from '../services/meetingService';
import { extractErrorMessage } from '../services/api';
import './MeetingRoom.css';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { toast } from '../utils/toast';

const getAvatarColor = (name?: string | null) => {
  if (!name) return '#6b7280';
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const MeetingRoom: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setBreadcrumbs, cacheWorkspaceName } = useBreadcrumbs();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [token, setToken] = useState<string>('');
  const [livekitUrl, setLivekitUrl] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEndedMeeting, setIsEndedMeeting] = useState(false);

  // Media Controls State
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [participantsList, setParticipantsList] = useState<Participant[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'participants' | 'transcript' | null>(null);

  // Transcript & Live Caption State
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [liveCaption, setLiveCaption] = useState<string>('');

  // Audio Capture & Groq Whisper Pipeline State
  const roomRef = useRef<Room | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const meetingStartTimeRef = useRef<number>(Date.now());
  const BATCH_DURATION_MS = 30000; // 30-second audio batching window
  const pendingUploadPromiseRef = useRef<Promise<any> | null>(null);
  const [queueStatus, setQueueStatus] = useState<TranscriptionQueueStatus | null>(null);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle');
  const [transcriptionError, setTranscriptionError] = useState<string>('');
  const [hasConsented, setHasConsented] = useState<boolean>(true);

  // 1. Fetch meeting & LiveKit Token
  const initMeeting = async () => {
    try {
      setLoading(true);
      setError('');
      setIsEndedMeeting(false);
      const joinRes = await meetingService.join(meetingId!);
      setMeeting(joinRes.data.meeting);
      setToken(joinRes.data.livekit_token);
      setLivekitUrl(joinRes.data.livekit_url);
      setIsHost(joinRes.data.is_host);
      setHasConsented(joinRes.data.meeting.recording_consent);

      if (joinRes.data.meeting.workspace_id) {
        cacheWorkspaceName(joinRes.data.meeting.workspace_id, 'Workspace');
      }

      setBreadcrumbs([
        { label: 'Workspaces', path: '/workspaces' },
        { label: 'Workspace', path: `/workspaces/${joinRes.data.meeting.workspace_id}` },
        ...(joinRes.data.meeting.project_id
          ? [{ label: joinRes.data.meeting.project_name || 'Project', path: `/projects/${joinRes.data.meeting.project_id}` }]
          : []),
        { label: 'Meetings', path: `/workspaces/${joinRes.data.meeting.workspace_id}/meetings` },
        { label: joinRes.data.meeting.title, path: `/meetings/${meetingId}` },
        { label: 'Live Room' },
      ]);

      // Fetch existing transcript
      const transRes = await meetingService.getTranscript(meetingId!);
      setTranscripts(transRes.data);
    } catch (err: any) {
      const errCode = err.response?.data?.detail?.error?.code;
      const errMsg = err.response?.data?.detail?.error?.message || '';

      if (errCode === 'MEETING_INACTIVE' || errMsg.toLowerCase().includes('already ended') || err.response?.status === 400) {
        setIsEndedMeeting(true);
        try {
          const detailRes = await meetingService.get(meetingId!);
          setMeeting(detailRes.data);
          setBreadcrumbs([
            { label: 'Workspaces', path: '/workspaces' },
            { label: 'Workspace', path: `/workspaces/${detailRes.data.workspace_id}` },
            { label: 'Meetings', path: `/workspaces/${detailRes.data.workspace_id}/meetings` },
            { label: detailRes.data.title, path: `/meetings/${meetingId}` },
          ]);
        } catch {
          // ignore
        }
      } else if (err.response?.status === 401) {
        setError('Your login session has expired. Please sign in again.');
      } else if (err.response?.status === 403) {
        setError('Access denied: You are not authorized to access this workspace meeting.');
      } else if (err.response?.status === 404) {
        setError('Meeting not found. It may have been deleted or the link is incorrect.');
      } else {
        setError(extractErrorMessage(err, 'Failed to connect to the video room. WebRTC video server may be unreachable.'));
        try {
          const detailRes = await meetingService.get(meetingId!);
          setMeeting(detailRes.data);
        } catch {
          // ignore
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initMeeting();
    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (meetingId) {
        meetingService.leave(meetingId).catch(() => null);
      }
    };
  }, [meetingId]);

  // 2. Connect to LiveKit Room
  useEffect(() => {
    if (!token || !livekitUrl) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    const updateParticipants = () => {
      if (!room) return;
      const all: Participant[] = [];
      if (room.localParticipant) all.push(room.localParticipant);
      room.remoteParticipants.forEach((p) => all.push(p));
      setParticipantsList([...all]);
    };

    // Attach remote track helper
    const attachTrack = (track: Track, participant: Participant) => {
      const container = document.getElementById(`participant-container-${participant.identity}`);
      if (track.kind === Track.Kind.Video) {
        const videoEl = document.createElement('video');
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.id = `video-${participant.identity}-${track.sid}`;
        videoEl.className = 'w-full h-full object-cover';
        track.attach(videoEl);
        if (container) {
          const placeholder = container.querySelector('.avatar-placeholder');
          if (placeholder) placeholder.classList.add('hidden');
          container.appendChild(videoEl);
        }
      } else if (track.kind === Track.Kind.Audio) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.id = `audio-${participant.identity}-${track.sid}`;
        track.attach(audioEl);
        document.body.appendChild(audioEl);
      }
    };

    // Detach remote track helper
    const detachTrack = (track: Track, participant: Participant) => {
      if (track.kind === Track.Kind.Video) {
        const videoEl = document.getElementById(`video-${participant.identity}-${track.sid}`);
        if (videoEl) {
          track.detach(videoEl as HTMLMediaElement);
          videoEl.remove();
        }
        const container = document.getElementById(`participant-container-${participant.identity}`);
        if (container) {
          const placeholder = container.querySelector('.avatar-placeholder');
          if (placeholder) placeholder.classList.remove('hidden');
        }
      } else if (track.kind === Track.Kind.Audio) {
        const audioEl = document.getElementById(`audio-${participant.identity}-${track.sid}`);
        if (audioEl) {
          track.detach(audioEl as HTMLMediaElement);
          audioEl.remove();
        }
      }
    };

    // Event listeners
    room
      .on(RoomEvent.Connected, () => {
        updateParticipants();
      })
      .on(RoomEvent.ParticipantConnected, (_p) => {
        updateParticipants();
      })
      .on(RoomEvent.ParticipantDisconnected, (_p) => {
        updateParticipants();
      })
      .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        attachTrack(track, participant);
      })
      .on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        detachTrack(track, participant);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (speakers.length > 0) {
          setActiveSpeakerId(speakers[0].identity);
        } else {
          setActiveSpeakerId(null);
        }
      })
      .on(RoomEvent.Disconnected, () => {
        setParticipantsList([]);
      });

    // Connect & publish camera/mic
    room
      .connect(livekitUrl, token)
      .then(async () => {
        try {
          if (isVideoOn) {
            await room.localParticipant.setCameraEnabled(true);
            const camTrack = room.localParticipant.getTrackPublication(Track.Source.Camera);
            if (camTrack?.track && localVideoRef.current) {
              camTrack.track.attach(localVideoRef.current);
            }
          }
          if (isMicOn) {
            await room.localParticipant.setMicrophoneEnabled(true);
          }
        } catch (mediaErr) {
          console.warn('Initial camera/mic attach error (permissions might be blocked):', mediaErr);
        }
        updateParticipants();
      })
      .catch((err) => {
        console.error('LiveKit Room connection failed:', err);
        setError('Could not connect to WebRTC video server. Please verify LIVEKIT_URL credentials in backend/.env.');
      });

    return () => {
      room.disconnect();
    };
  }, [token, livekitUrl]);

  // Validation helper for audio before uploading
  const validateAudioBlob = (blob: Blob, durationMs: number): { valid: boolean; reason?: string } => {
    if (!blob || blob.size < 200) {
      return { valid: false, reason: 'Audio payload empty or too small' };
    }
    if (blob.size > 25 * 1024 * 1024) {
      return { valid: false, reason: 'Audio payload exceeds maximum size (25MB)' };
    }
    if (durationMs > 0 && durationMs < 500) {
      return { valid: false, reason: 'Audio duration too short (<500ms)' };
    }
    return { valid: true };
  };

  const fetchQueueStatus = async () => {
    if (!meetingId) return;
    try {
      const res = await meetingService.getQueueStatus(meetingId);
      setQueueStatus(res.data);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (!meetingId) return;
    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 7000);
    return () => clearInterval(interval);
  }, [meetingId]);

  const handleRetryFailedBatches = async () => {
    if (!meetingId) return;
    try {
      setTranscriptionStatus('transcribing');
      await meetingService.retryFailedAudio(meetingId);
      await fetchQueueStatus();
      setTimeout(async () => {
        const transRes = await meetingService.getTranscript(meetingId);
        setTranscripts(transRes.data);
      }, 2000);
    } catch (err: any) {
      console.error('Failed to retry audio batches:', err);
    }
  };

  // Audio Batch Ingestion Handler
  const uploadAudioBatch = async (audioBlob: Blob, startTimeOffsetMs: number, durationMs: number = 0) => {
    if (!meetingId) return;
    const validation = validateAudioBlob(audioBlob, durationMs);
    if (!validation.valid) {
      console.debug('Skipping audio upload:', validation.reason);
      return;
    }

    try {
      setTranscriptionStatus('transcribing');
      const speaker = user?.name || user?.email || 'Speaker';
      const participantId = roomRef.current?.localParticipant?.identity || user?.id;
      const res = await meetingService.uploadAudio(meetingId, audioBlob, startTimeOffsetMs, speaker, participantId);
      if (res.data && res.data.length > 0) {
        setTranscripts((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const fresh = res.data.filter((t: TranscriptSegment) => !existingIds.has(t.id));
          return [...prev, ...fresh];
        });
        const latestText = res.data[res.data.length - 1].content;
        setLiveCaption(latestText);
        setTimeout(() => setLiveCaption(''), 5000);
      }
      setTranscriptionError('');
      setTranscriptionStatus('recording');
      fetchQueueStatus();
    } catch (err: any) {
      console.warn('Audio batch transcription error:', err);
      const errMsg = err?.response?.data?.detail?.error?.message || err?.message || 'Groq Whisper unavailable';
      setTranscriptionError(errMsg);
      setTranscriptionStatus('error');
      fetchQueueStatus();
    }
  };

  // 3. Audio Capture Pipeline using MediaRecorder (Configurable 30-second safe batches)
  useEffect(() => {
    if (!meeting?.recording_consent || !hasConsented || !isMicOn) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      setTranscriptionStatus('idle');
      return;
    }

    let isMounted = true;
    let chunkInterval: any = null;

    const startAudioPipeline = async () => {
      try {
        let track: MediaStreamTrack | null = null;
        const localPub = roomRef.current?.localParticipant?.getTrackPublication(Track.Source.Microphone);
        if (localPub?.track?.mediaStreamTrack) {
          track = localPub.track.mediaStreamTrack;
        }

        if (!track) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            track = micStream.getAudioTracks()[0];
          } catch (micErr) {
            console.warn('Could not acquire fallback microphone stream:', micErr);
          }
        }

        if (!track || !isMounted) return;

        const stream = new MediaStream([track]);
        audioStreamRef.current = stream;

        let mimeType = 'audio/webm;codecs=opus';
        if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
          else mimeType = '';
        }

        const recordCycle = () => {
          if (!isMounted || !isMicOn) return;
          try {
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            const chunkStartTime = Date.now();
            let batchChunks: Blob[] = [];

            recorder.ondataavailable = (event: BlobEvent) => {
              if (event.data && event.data.size > 0) {
                batchChunks.push(event.data);
              }
            };

            recorder.onstop = async () => {
              if (batchChunks.length > 0) {
                const fullBatchBlob = new Blob(batchChunks, { type: mimeType || 'audio/webm' });
                batchChunks = [];
                const durationMs = Math.max(0, Date.now() - chunkStartTime);
                const offsetMs = Math.max(0, chunkStartTime - meetingStartTimeRef.current);
                const p = uploadAudioBatch(fullBatchBlob, offsetMs, durationMs);
                pendingUploadPromiseRef.current = p;
                await p;
              }
            };

            // Start recorder requesting slices every 1s
            recorder.start(1000);
            setTranscriptionStatus('recording');

            // Collect discrete 30-second standalone audio batches
            chunkInterval = setTimeout(() => {
              if (recorder.state === 'recording') {
                recorder.stop();
                if (isMounted && isMicOn) {
                  recordCycle();
                }
              }
            }, BATCH_DURATION_MS);
          } catch (recErr) {
            console.warn('MediaRecorder cycle initiation error:', recErr);
            setTranscriptionStatus('error');
          }
        };

        recordCycle();
      } catch (err) {
        console.warn('Could not initialize microphone audio pipeline:', err);
        setTranscriptionStatus('error');
      }
    };

    startAudioPipeline();

    return () => {
      isMounted = false;
      if (chunkInterval) clearTimeout(chunkInterval);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
    };
  }, [isMicOn, meeting?.recording_consent, hasConsented, meetingId]);

  // Media Toggle Handlers
  const toggleMic = async () => {
    if (roomRef.current?.localParticipant) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(!isMicOn);
    }
    setIsMicOn(!isMicOn);
  };

  const toggleVideo = async () => {
    if (roomRef.current?.localParticipant) {
      await roomRef.current.localParticipant.setCameraEnabled(!isVideoOn);
    }
    setIsVideoOn(!isVideoOn);
  };

  const toggleScreenShare = async () => {
    if (!roomRef.current?.localParticipant) return;
    try {
      await roomRef.current.localParticipant.setScreenShareEnabled(!isScreenSharing);
      setIsScreenSharing(!isScreenSharing);
    } catch (e) {
      console.error('Screen sharing error:', e);
    }
  };

  const handleCopyCode = () => {
    if (meeting?.meeting_code) {
      navigator.clipboard.writeText(meeting.meeting_code);
      setCopiedCode(true);
      toast.info('Meeting Code Copied', `Code ${meeting.meeting_code} copied to clipboard`);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleEndMeeting = async () => {
    if (isEndingMeeting) return;
    setIsEndingMeeting(true);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Await the final incomplete audio batch upload
    if (pendingUploadPromiseRef.current) {
      try {
        await Promise.race([
          pendingUploadPromiseRef.current,
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch (e) {
        console.warn('Error flushing final audio batch:', e);
      }
    }

    if (isHost) {
      if (confirm('End meeting for all attendees? Action items and summary will be automatically processed from the complete transcript.')) {
        try {
          await meetingService.end(meetingId!);
          await meetingService.leave(meetingId!).catch(() => null);
        } catch (err) {
          console.warn('Error ending meeting:', err);
        }
        toast.success('Meeting Ended', 'Redirecting to AI meeting intelligence dashboard...');
        roomRef.current?.disconnect();
        navigate(`/meetings/${meetingId}`);
      } else {
        setIsEndingMeeting(false);
      }
    } else {
      await meetingService.leave(meetingId!).catch(() => null);
      toast.info('Left Meeting', 'You have left the meeting room.');
      roomRef.current?.disconnect();
      navigate(`/meetings/${meetingId}`);
    }
  };

  if (loading) {
    return (
      <div className="room-error-overlay">
        <ThinkingLoader
          state="connecting"
          size={64}
          message="Connecting to Video Conference..."
          description="Authenticating LiveKit room token & media tracks"
        />
      </div>
    );
  }

  if (isEndedMeeting) {
    const wsTarget = meeting?.workspace_id ? `/workspaces/${meeting.workspace_id}/meetings` : '/workspaces';
    return (
      <div className="room-error-overlay">
        <div className="error-icon-box" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
          <Clock size={32} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>
            Meeting Concluded
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
            {meeting?.title ? `The live call for "${meeting.title}" has concluded.` : 'The live call has concluded.'}{' '}
            All transcripts, AI summaries, and suggested tasks are permanently saved and reviewable.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => navigate(`/meetings/${meetingId}`)}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.25rem' }}
          >
            <FileText size={15} />
            <span>View Saved Meeting & Notes</span>
          </button>
          <button
            onClick={() => navigate(wsTarget)}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.25rem' }}
          >
            <Briefcase size={15} />
            <span>Return to Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    const wsTarget = meeting?.workspace_id ? `/workspaces/${meeting.workspace_id}/meetings` : '/workspaces';
    return (
      <div className="room-error-overlay">
        <div className="error-icon-box">
          <AlertCircle size={32} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#ffffff' }}>
            Unable to Connect to Room
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#a1a1aa', maxWidth: 480, margin: '0 auto', lineHeight: 1.5 }}>
            {error}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={initMeeting}
            className="btn btn-primary"
            style={{ padding: '0.55rem 1.15rem' }}
          >
            <RefreshCw size={14} />
            <span>Retry Connection</span>
          </button>
          <button
            onClick={() => navigate(`/meetings/${meetingId}`)}
            className="btn btn-secondary"
            style={{ padding: '0.55rem 1.15rem' }}
          >
            <FileText size={14} />
            <span>Meeting Details</span>
          </button>
          <button
            onClick={() => navigate(wsTarget)}
            className="btn btn-secondary"
            style={{ padding: '0.55rem 1.15rem' }}
          >
            <Briefcase size={14} />
            <span>Return to Workspace</span>
          </button>
        </div>
      </div>
    );
  }

  const otherParticipants = participantsList.filter((p) => p.identity !== user?.id);
  const totalCount = participantsList.length || 1;
  const gridCountClass =
    totalCount === 1 ? 'count-1' : totalCount === 2 ? 'count-2' : totalCount <= 4 ? 'count-4' : 'count-many';

  return (
    <div className="meeting-room-viewport" id="meeting-room-root">
      {/* Top Navbar */}
      <header className="room-navbar">
        <div className="room-nav-left">
          <div className="room-nav-icon">
            <Radio size={18} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="room-meeting-title">
              <span>{meeting?.title}</span>
              <span className="meeting-status-badge live" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                <span className="pulse-dot" />
                Live
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Pipeline & Transcription Status */}
        <div className="room-nav-center">
          <div
            className={`pipeline-status-badge ${
              queueStatus && queueStatus.failed_count > 0
                ? 'error'
                : transcriptionStatus === 'transcribing' || (queueStatus && queueStatus.pending_count > 0)
                ? 'active'
                : transcriptionStatus === 'recording'
                ? 'recording'
                : transcriptionStatus === 'error'
                ? 'error'
                : ''
            }`}
            title={transcriptionError || (queueStatus && queueStatus.failed_count > 0 ? `${queueStatus.failed_count} batch failed` : undefined)}
          >
            {transcriptionStatus === 'recording' && <span className="pipeline-pulse-dot" />}
            <Sparkles size={13} />
            <span>
              {queueStatus && queueStatus.failed_count > 0
                ? `Groq Whisper: ${queueStatus.failed_count} Batch Failed (Audio Preserved)`
                : transcriptionStatus === 'transcribing' || (queueStatus && queueStatus.pending_count > 0)
                ? `Groq Whisper: Transcribing (${queueStatus?.pending_count || 1} in queue)...`
                : transcriptionStatus === 'recording'
                ? 'Groq Whisper Pipeline Active (30s Batches)'
                : transcriptionStatus === 'error'
                ? (transcriptionError ? `Groq: ${transcriptionError}` : 'Groq Whisper Unavailable')
                : meeting?.recording_consent
                ? 'Groq Whisper Ready'
                : 'Transcription Disabled'}
            </span>
          </div>
        </div>

        {/* Right: Code Copy & Actions */}
        <div className="room-nav-right">
          <button
            onClick={handleCopyCode}
            id="copy-meeting-code-btn"
            className="meeting-code-chip"
            title="Click to copy meeting code"
          >
            <span style={{ color: '#71717a' }}>Code:</span>
            <span style={{ fontWeight: 700, color: '#818cf8' }}>{meeting?.meeting_code}</span>
            {copiedCode ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="room-content-area">
        <div className="room-stage-container">
          {/* Recording & AI Transcription Consent Banner */}
          {meeting?.recording_consent && !hasConsented && (
            <div className="room-consent-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <ShieldCheck size={18} style={{ color: '#818cf8', flexShrink: 0 }} />
                <span>
                  <strong>Recording & Transcription Notice:</strong> Participant audio is streamed to Groq Whisper to generate timestamped transcripts and AI action items.
                </span>
              </div>
              <div className="consent-banner-actions">
                <button
                  onClick={async () => {
                    setHasConsented(true);
                    await meetingService.recordConsent(meetingId!, true);
                  }}
                  className="btn-consent-agree"
                >
                  I Consent
                </button>
              </div>
            </div>
          )}

          {/* Video Grid */}
          <div className={`room-video-grid ${gridCountClass}`}>
            {/* Local Participant Tile */}
            <div
              id="local-participant-tile"
              className={`video-tile-box ${activeSpeakerId === user?.id ? 'active-speaker' : ''}`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                style={{ display: isVideoOn ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {!isVideoOn && (
                <div className="video-tile-avatar">
                  <div className="avatar-circle">
                    {user?.name ? user.name[0].toUpperCase() : 'U'}
                  </div>
                  <span className="avatar-name">Camera Off</span>
                </div>
              )}

              {/* Local Participant Identity Pill */}
              <div className="participant-name-tag">
                <span>{user?.name || 'You'} (You)</span>
                <span className={`participant-mic-status ${isMicOn ? 'live' : 'muted'}`}>
                  {isMicOn ? <Mic size={12} /> : <MicOff size={12} />}
                </span>
              </div>
            </div>

            {/* Remote Participant Tiles */}
            {otherParticipants.map((p) => (
              <div
                key={p.identity}
                id={`participant-container-${p.identity}`}
                className={`video-tile-box ${activeSpeakerId === p.identity ? 'active-speaker' : ''}`}
              >
                <div className="video-tile-avatar avatar-placeholder">
                  <div className="avatar-circle" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                    {p.name ? p.name[0].toUpperCase() : 'P'}
                  </div>
                  <span className="avatar-name">{p.name || p.identity}</span>
                </div>
                <div className="participant-name-tag">
                  <span>{p.name || p.identity}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Live Subtitle Overlay */}
          {liveCaption && (
            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '0.625rem 1.25rem',
                borderRadius: '30px',
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#ffffff',
                maxWidth: '650px',
                textAlign: 'center',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
                zIndex: 20,
              }}
            >
              <span style={{ color: '#818cf8', fontWeight: 600, marginRight: '0.5rem' }}>
                {user?.name}:
              </span>
              "{liveCaption}"
            </div>
          )}
        </div>

        {/* Collapsible Side Drawer (Participants & Live Transcript) */}
        {activeTab && (
          <aside className="room-side-drawer">
            <div className="drawer-header-row">
              <div className="drawer-tab-switch">
                <button
                  onClick={() => setActiveTab('participants')}
                  className={`drawer-tab-btn ${activeTab === 'participants' ? 'active' : ''}`}
                >
                  Attendees ({totalCount})
                </button>
                <button
                  onClick={() => setActiveTab('transcript')}
                  className={`drawer-tab-btn ${activeTab === 'transcript' ? 'active' : ''}`}
                >
                  Live Transcripts ({transcripts.length})
                </button>
              </div>
              <button
                onClick={() => setActiveTab(null)}
                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                aria-label="Close panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="drawer-scroll-body">
              {activeTab === 'participants' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Local User */}
                  <div className="participant-row">
                    <div className="participant-info">
                      <div className="participant-avatar-small">
                        {user?.name ? user.name[0].toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="participant-name-text">{user?.name || 'You'} (You)</div>
                        <div style={{ fontSize: '0.7rem', color: '#71717a' }}>{user?.email}</div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                      }}
                    >
                      {isHost ? 'HOST' : 'YOU'}
                    </span>
                  </div>

                  {/* Remote Users */}
                  {otherParticipants.map((p) => (
                    <div key={p.identity} className="participant-row">
                      <div className="participant-info">
                        <div
                          className="participant-avatar-small"
                          style={{ background: '#3b82f6' }}
                        >
                          {p.name ? p.name[0].toUpperCase() : 'P'}
                        </div>
                        <span className="participant-name-text">{p.name || p.identity}</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Attendee</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'transcript' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Queue Status Notifications */}
                  {queueStatus && queueStatus.failed_count > 0 && (
                    <div className="transcript-failed-card">
                      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2, color: '#f87171' }} />
                      <div style={{ flex: 1 }}>
                        <strong>{queueStatus.failed_count} Audio Batch Failed Transcription</strong>
                        <p>{queueStatus.failed_batches[0]?.error_message || 'Rate limit or transient network error. Audio was preserved.'}</p>
                        <button onClick={handleRetryFailedBatches} className="btn-retry-batch">
                          Retry Preserved Audio
                        </button>
                      </div>
                    </div>
                  )}

                  {queueStatus && (queueStatus.pending_count > 0 || queueStatus.processing_count > 0) && (
                    <div className="transcript-pending-card">
                      <ThinkingLoader
                        state="listening"
                        size={20}
                        inline
                        message={`Transcribing ${queueStatus.pending_count + queueStatus.processing_count} audio ${queueStatus.pending_count + queueStatus.processing_count === 1 ? 'batch' : 'batches'} in background queue...`}
                      />
                    </div>
                  )}

                  {transcripts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#71717a', fontSize: '0.8rem' }}>
                      <FileText size={24} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} />
                      <p style={{ margin: 0 }}>Speak into your microphone. 30-second audio batches will transcribe automatically...</p>
                    </div>
                  ) : (
                    transcripts.map((t) => (
                      <div key={t.id} className="transcript-bubble">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div
                            className="participant-avatar-small"
                            style={{
                              width: 22,
                              height: 22,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              background: getAvatarColor(t.speaker_name || t.participant_id),
                              flexShrink: 0,
                            }}
                          >
                            {(t.speaker_name ? t.speaker_name[0] : 'U').toUpperCase()}
                          </div>
                          <div className="bubble-meta" style={{ flex: 1, margin: 0 }}>
                            <span className="bubble-speaker">{t.speaker_name || 'Speaker'}</span>
                            <span className="completed-badge">{t.processing_status || 'Completed'}</span>
                            <span className="bubble-time">
                              {new Date(t.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                        <p className="bubble-content">{t.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Floating Bottom Control Dock */}
      <footer className="room-control-dock">
        {/* Mic Toggle */}
        <button
          onClick={toggleMic}
          id="toggle-mic-btn"
          className={`dock-btn ${!isMicOn ? 'muted-off' : ''}`}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Video Toggle */}
        <button
          onClick={toggleVideo}
          id="toggle-video-btn"
          className={`dock-btn ${!isVideoOn ? 'muted-off' : ''}`}
          title={isVideoOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Screen Share */}
        <button
          onClick={toggleScreenShare}
          id="toggle-screen-share-btn"
          className={`dock-btn ${isScreenSharing ? 'active-pill' : ''}`}
          title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
        >
          <Share2 size={20} />
        </button>

        <div style={{ width: 1, height: 28, background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

        {/* Participants Toggle */}
        <button
          onClick={() => setActiveTab(activeTab === 'participants' ? null : 'participants')}
          id="toggle-participants-panel-btn"
          className={`dock-btn ${activeTab === 'participants' ? 'active-pill' : ''}`}
          title="Attendees"
        >
          <Users size={20} />
          {otherParticipants.length > 0 && (
            <span className="dock-btn-badge">{totalCount}</span>
          )}
        </button>

        {/* Transcripts Toggle */}
        <button
          onClick={() => setActiveTab(activeTab === 'transcript' ? null : 'transcript')}
          id="toggle-transcript-panel-btn"
          className={`dock-btn ${activeTab === 'transcript' ? 'active-pill' : ''}`}
          title="Live Transcripts"
        >
          <FileText size={20} />
          {transcripts.length > 0 && (
            <span className="dock-btn-badge" style={{ background: '#10b981' }}>
              {transcripts.length}
            </span>
          )}
        </button>

        <div style={{ width: 1, height: 28, background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

        {/* Leave / End Meeting Button */}
        <button
          onClick={handleEndMeeting}
          id="leave-meeting-btn"
          className="dock-btn btn-leave-call"
        >
          <PhoneOff size={18} />
          <span>{isHost ? 'End Meeting' : 'Leave'}</span>
        </button>
      </footer>
    </div>
  );
};
