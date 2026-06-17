import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import {
  Camera,
  Check,
  Hand,
  Mic,
  MonitorUp,
  PhoneOff,
  Send,
  Users
} from "lucide-react";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { StatusPill } from "../../components/StatusPill.jsx";
import { asArray, formatDateTime } from "../../utils/format.js";

const liveTabs = ["agenda", "documents", "notes", "votes", "tasks"];

function apiOrigin() {
  const base = api.defaults.baseURL || "http://localhost:4000/api";
  return base.replace(/\/api\/?$/, "");
}

function loadJitsiScript(src) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-jitsi-api]");
    if (existing) {
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = src || "https://meet.jit.si/external_api.js";
    script.async = true;
    script.dataset.jitsiApi = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
}

function voteOptions(vote) {
  if (Array.isArray(vote.options)) return vote.options;
  try {
    return JSON.parse(vote.options || "[]");
  } catch {
    return [];
  }
}

export function LiveMeetingPage() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [config, setConfig] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [publicNotes, setPublicNotes] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
  const [activeTab, setActiveTab] = useState("agenda");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [voteResults, setVoteResults] = useState({});
  const [socketState, setSocketState] = useState("connecting");
  const jitsiRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const socketRef = useRef(null);

  const isOrganizer = user.role === "ORGANIZER";
  const liveBackPath =
    user.role === "ORGANIZER" ? `/organizer/meetings/${id}` : `/participant/meetings/${id}`;

  async function loadData() {
    const [meetingRes, configRes, chatRes, publicNotesRes, personalNotesRes] =
      await Promise.all([
        api.get(`/meetings/${id}`),
        api.get(`/meetings/${id}/live-config`),
        api.get(`/meetings/${id}/chat`, { params: { limit: 80 } }),
        api.get(`/meetings/${id}/public-notes`),
        api.get(`/meetings/${id}/personal-notes`)
      ]);
    setMeeting(meetingRes.data.data);
    setConfig(configRes.data.data);
    setChat(chatRes.data.data || []);
    setPublicNotes(publicNotesRes.data.data?.content || "");
    setPersonalNotes(personalNotesRes.data.data?.content || "");
  }

  useEffect(() => {
    loadData().catch((err) => setError(err.response?.data?.message || "Cannot load live room"));
  }, [id]);

  useEffect(() => {
    if (!config?.roomName || !jitsiRef.current) return undefined;
    let disposed = false;
    loadJitsiScript(config.externalApiUrl)
      .then(() => {
        if (disposed || !window.JitsiMeetExternalAPI) return;
        jitsiApiRef.current?.dispose?.();
        jitsiApiRef.current = new window.JitsiMeetExternalAPI(config.jitsiDomain, {
          roomName: config.roomName,
          parentNode: jitsiRef.current,
          userInfo: {
            displayName: user.full_name || user.email,
            email: user.email
          },
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            disableDeepLinking: true
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false
          }
        });
      })
      .catch(() => setError("Cannot load Jitsi external API"));

    return () => {
      disposed = true;
      jitsiApiRef.current?.dispose?.();
      jitsiApiRef.current = null;
    };
  }, [config?.roomName, user.email, user.full_name]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(`${apiOrigin()}/meeting`, {
      auth: { token },
      transports: ["websocket", "polling"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketState("online");
      socket.emit("join_meeting_room", { meetingId: id }, (reply) => {
        if (!reply?.ok) setError(reply?.message || "Cannot join realtime room");
      });
    });
    socket.on("disconnect", () => setSocketState("offline"));
    socket.on("new_chat_message", (message) => {
      setChat((current) => [...current, message].slice(-120));
    });
    socket.on("hand_status_updated", ({ userId, isHandRaised }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId
                  ? { ...item, is_hand_raised: isHandRaised }
                  : item
              )
            }
          : current
      );
    });
    socket.on("participant_status_updated", ({ userId, isOnline }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId ? { ...item, is_online: isOnline } : item
              )
            }
          : current
      );
    });
    socket.on("meeting_status_updated", (nextMeeting) => {
      setMeeting((current) => (current ? { ...current, ...nextMeeting } : nextMeeting));
      if (nextMeeting.status === "FINISHED") setNotice("Cuộc họp đã kết thúc");
      if (nextMeeting.status === "CANCELLED") setError("Cuộc họp đã bị hủy");
    });
    socket.on("attendance_updated", ({ userId, status }) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.user_id === userId ? { ...item, attendance_status: status } : item
              )
            }
          : current
      );
    });
    socket.on("public_notes_synced", (notes) => setPublicNotes(notes.content || ""));
    socket.on("current_agenda_updated", (agendaItem) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              agenda: current.agenda.map((item) =>
                item.id === agendaItem.id
                  ? agendaItem
                  : agendaItem.status === "CURRENT"
                    ? { ...item, status: item.status === "CURRENT" ? "PENDING" : item.status }
                    : item
              )
            }
          : current
      );
    });
    socket.on("current_document_updated", (document) => {
      setMeeting((current) =>
        current
          ? {
              ...current,
              documents: current.documents.map((item) =>
                item.id === document.id
                  ? document
                  : document.is_presenting
                    ? { ...item, is_presenting: false }
                    : item
              )
            }
          : current
      );
    });
    socket.on("vote_opened", (vote) => {
      setNotice(`Vote opened: ${vote.title}`);
      loadData();
    });
    socket.on("vote_closed", () => loadData());
    socket.on("vote_result_updated", ({ voteId, results }) => {
      setVoteResults((current) => ({ ...current, [voteId]: results }));
    });

    return () => {
      socket.emit("leave_meeting_room", { meetingId: id });
      socket.disconnect();
    };
  }, [id, token]);

  const participants = asArray(meeting?.participants);
  const currentDocument = useMemo(
    () => asArray(meeting?.documents).find((item) => item.is_presenting),
    [meeting?.documents]
  );
  const currentAgenda = useMemo(
    () => asArray(meeting?.agenda).find((item) => item.status === "CURRENT"),
    [meeting?.agenda]
  );

  async function refresh() {
    setError("");
    await loadData();
  }

  async function checkIn() {
    await api.post(`/meetings/${id}/attendance/checkin`, {});
    setNotice("Checked in");
    await refresh();
  }

  function sendChat(event) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    socketRef.current?.emit("send_chat_message", { meetingId: id, content }, (reply) => {
      if (!reply?.ok) setError(reply?.message || "Cannot send message");
    });
    setChatInput("");
  }

  function toggleHand() {
    const mine = participants.find((item) => item.user_id === user.id);
    socketRef.current?.emit(mine?.is_hand_raised ? "lower_hand" : "raise_hand", {
      meetingId: id
    });
  }

  async function savePublicNotes() {
    const res = await api.put(`/meetings/${id}/public-notes`, { content: publicNotes });
    socketRef.current?.emit("public_notes_updated", {
      meetingId: id,
      content: res.data.data.content
    });
  }

  async function savePersonalNotes() {
    await api.put(`/meetings/${id}/personal-notes`, { content: personalNotes });
    setNotice("Personal notes saved");
  }

  async function setAgendaCurrent(item) {
    const res = await api.put(`/agenda/${item.id}/current`);
    socketRef.current?.emit("agenda_current_changed", {
      meetingId: id,
      agendaItem: res.data.data
    });
  }

  async function setAgendaDone(item) {
    const res = await api.put(`/agenda/${item.id}/done`);
    socketRef.current?.emit("agenda_current_changed", {
      meetingId: id,
      agendaItem: res.data.data
    });
  }

  async function presentDocument(document) {
    const res = await api.put(`/documents/${document.id}/present`, { currentPage: 1 });
    socketRef.current?.emit("document_presented", {
      meetingId: id,
      document: res.data.data
    });
  }

  async function changeDocumentPage(document, delta) {
    const nextPage = Math.max(Number(document.current_page || 1) + delta, 1);
    const res = await api.put(`/documents/${document.id}/page`, { currentPage: nextPage });
    socketRef.current?.emit("document_page_changed", {
      meetingId: id,
      document: res.data.data
    });
  }

  async function answerVote(vote, answer) {
    await api.post(`/votes/${vote.id}/responses`, { answer });
    await loadVoteResults(vote.id);
    await refresh();
  }

  async function openVote(vote) {
    const res = await api.put(`/votes/${vote.id}/open`);
    socketRef.current?.emit("vote_opened", { meetingId: id, vote: res.data.data });
    await refresh();
  }

  async function closeVote(vote) {
    const res = await api.put(`/votes/${vote.id}/close`);
    socketRef.current?.emit("vote_closed", { meetingId: id, vote: res.data.data });
    await refresh();
  }

  async function loadVoteResults(voteId) {
    const res = await api.get(`/votes/${voteId}/results`);
    setVoteResults((current) => ({ ...current, [voteId]: res.data.data.results }));
  }

  function jitsiCommand(command) {
    jitsiApiRef.current?.executeCommand(command);
  }

  if (!meeting || !config) {
    return (
      <div className="page-stack">
        {error ? <div className="alert error">{error}</div> : <div className="boot-screen">Loading live room...</div>}
      </div>
    );
  }

  return (
    <div className="live-room">
      <section className="live-topbar">
        <div>
          <h2>{meeting.title}</h2>
          <p>
            {formatDateTime(meeting.start_time)} · {meeting.meeting_type} · realtime {socketState}
          </p>
        </div>
        <div className="row-actions">
          <StatusPill value={meeting.status} />
          <Link className="danger-button" to={liveBackPath}>
            <PhoneOff size={16} />
            Leave
          </Link>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="live-main">
        <div className="jitsi-stage" ref={jitsiRef}>
          {!config.roomName && <EmptyState title="This meeting has no online room" />}
        </div>
        <aside className="live-side">
          <div className="section-heading">
            <h2>
              <Users size={18} /> Participants
            </h2>
          </div>
          <div className="live-participants">
            {participants.map((item) => (
              <div key={item.user_id} className="live-participant">
                <div>
                  <strong>{item.full_name}</strong>
                  <span>{item.role_in_meeting}</span>
                </div>
                <div className="row-actions">
                  {item.is_online && <StatusPill value="ONLINE" />}
                  {item.is_hand_raised && <StatusPill value="HAND" />}
                  <StatusPill value={item.attendance_status || "ABSENT"} />
                </div>
              </div>
            ))}
          </div>

          <div className="live-chat">
            <h3>Chat</h3>
            <div className="chat-list">
              {chat.map((message) => (
                <div key={message.id || `${message.sender_id}-${message.created_at}`} className="chat-message">
                  <strong>{message.sender_name || message.sender_email}</strong>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={sendChat}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Message"
              />
              <button className="primary-button">
                <Send size={16} />
              </button>
            </form>
          </div>
        </aside>
      </section>

      <section className="live-controls">
        <button className="secondary-button" onClick={() => jitsiCommand("toggleAudio")}>
          <Mic size={16} />
          Mic
        </button>
        <button className="secondary-button" onClick={() => jitsiCommand("toggleVideo")}>
          <Camera size={16} />
          Camera
        </button>
        <button
          className="secondary-button"
          disabled={!config.permissions.canShareScreen}
          onClick={() => jitsiCommand("toggleShareScreen")}
        >
          <MonitorUp size={16} />
          Share
        </button>
        <button className="secondary-button" onClick={toggleHand}>
          <Hand size={16} />
          Hand
        </button>
        <button className="primary-button" onClick={checkIn}>
          <Check size={16} />
          Check-in
        </button>
      </section>

      <section className="live-bottom">
        <nav className="tabbar">
          {liveTabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        {activeTab === "agenda" && (
          <LiveAgenda
            agenda={asArray(meeting.agenda)}
            currentAgenda={currentAgenda}
            isOrganizer={isOrganizer}
            onCurrent={setAgendaCurrent}
            onDone={setAgendaDone}
          />
        )}
        {activeTab === "documents" && (
          <LiveDocuments
            documents={asArray(meeting.documents)}
            currentDocument={currentDocument}
            isOrganizer={isOrganizer}
            onPresent={presentDocument}
            onPage={changeDocumentPage}
          />
        )}
        {activeTab === "notes" && (
          <LiveNotes
            publicNotes={publicNotes}
            personalNotes={personalNotes}
            onPublicChange={setPublicNotes}
            onPersonalChange={setPersonalNotes}
            onSavePublic={savePublicNotes}
            onSavePersonal={savePersonalNotes}
            canEditPublic={config.permissions.isOrganizer || config.permissions.roleInMeeting === "SECRETARY"}
          />
        )}
        {activeTab === "votes" && (
          <LiveVotes
            votes={asArray(meeting.votes)}
            voteResults={voteResults}
            isOrganizer={isOrganizer}
            onOpen={openVote}
            onClose={closeVote}
            onAnswer={answerVote}
            onResults={loadVoteResults}
          />
        )}
        {activeTab === "tasks" && <LiveTasks tasks={asArray(meeting.tasks)} />}
      </section>
    </div>
  );
}

function LiveAgenda({ agenda, currentAgenda, isOrganizer, onCurrent, onDone }) {
  if (agenda.length === 0) return <EmptyState title="No agenda" />;
  return (
    <div className="live-panel-grid">
      {currentAgenda && (
        <article className="live-focus">
          <span>Current agenda</span>
          <strong>{currentAgenda.title}</strong>
        </article>
      )}
      {agenda.map((item) => (
        <article key={item.id} className="live-card">
          <div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <StatusPill value={item.status} />
          </div>
          {isOrganizer && (
            <div className="row-actions">
              <button className="secondary-button" onClick={() => onCurrent(item)}>
                Current
              </button>
              <button className="secondary-button" onClick={() => onDone(item)}>
                Done
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function LiveDocuments({ documents, currentDocument, isOrganizer, onPresent, onPage }) {
  return (
    <div className="live-panel-grid">
      {currentDocument && (
        <article className="live-focus">
          <span>Presenting document</span>
          <strong>{currentDocument.display_name}</strong>
          <p>Page {currentDocument.current_page || 1}</p>
          {isOrganizer && (
            <div className="row-actions">
              <button className="secondary-button" onClick={() => onPage(currentDocument, -1)}>
                Prev
              </button>
              <button className="secondary-button" onClick={() => onPage(currentDocument, 1)}>
                Next
              </button>
            </div>
          )}
        </article>
      )}
      {documents.length === 0 ? (
        <EmptyState title="No documents" />
      ) : (
        documents.map((document) => (
          <article key={document.id} className="live-card">
            <div>
              <h3>{document.display_name}</h3>
              <p>{document.original_name}</p>
              <StatusPill value={document.status} />
            </div>
            {isOrganizer && document.status === "APPROVED" && (
              <button className="secondary-button" onClick={() => onPresent(document)}>
                Present
              </button>
            )}
          </article>
        ))
      )}
    </div>
  );
}

function LiveNotes({
  publicNotes,
  personalNotes,
  onPublicChange,
  onPersonalChange,
  onSavePublic,
  onSavePersonal,
  canEditPublic
}) {
  return (
    <div className="live-notes-grid">
      <label>
        Public notes
        <textarea
          value={publicNotes}
          onChange={(event) => onPublicChange(event.target.value)}
          readOnly={!canEditPublic}
        />
      </label>
      <label>
        Personal notes
        <textarea value={personalNotes} onChange={(event) => onPersonalChange(event.target.value)} />
      </label>
      <div className="row-actions">
        {canEditPublic && (
          <button className="primary-button" onClick={onSavePublic}>
            Save public
          </button>
        )}
        <button className="secondary-button" onClick={onSavePersonal}>
          Save personal
        </button>
      </div>
    </div>
  );
}

function LiveVotes({ votes, voteResults, isOrganizer, onOpen, onClose, onAnswer, onResults }) {
  if (votes.length === 0) return <EmptyState title="No votes" />;
  return (
    <div className="live-panel-grid">
      {votes.map((vote) => (
        <article key={vote.id} className="live-card">
          <div>
            <h3>{vote.title}</h3>
            <p>{vote.description}</p>
            <StatusPill value={vote.status} />
          </div>
          {vote.status === "OPEN" && !isOrganizer && !vote.my_answer && (
            <div className="row-actions">
              {voteOptions(vote).map((option) => (
                <button key={option} className="secondary-button" onClick={() => onAnswer(vote, option)}>
                  {option}
                </button>
              ))}
            </div>
          )}
          {isOrganizer && (
            <div className="row-actions">
              <button className="secondary-button" onClick={() => onOpen(vote)}>
                Open
              </button>
              <button className="secondary-button" onClick={() => onClose(vote)}>
                Close
              </button>
            </div>
          )}
          <button className="secondary-button" onClick={() => onResults(vote.id)}>
            Results
          </button>
          {voteResults[vote.id] && (
            <div className="result-bars">
              {voteResults[vote.id].map((item) => (
                <div key={item.answer}>
                  <span>{item.answer}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function LiveTasks({ tasks }) {
  if (tasks.length === 0) return <EmptyState title="No tasks" />;
  return (
    <div className="live-panel-grid">
      {tasks.map((task) => (
        <article key={task.id} className="live-card">
          <h3>{task.title}</h3>
          <p>{task.description}</p>
          <div className="row-actions">
            <StatusPill value={task.priority} />
            <StatusPill value={task.status} />
          </div>
        </article>
      ))}
    </div>
  );
}
