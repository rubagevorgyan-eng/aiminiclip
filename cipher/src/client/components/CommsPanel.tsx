import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { channelsFor, writeBlock } from '../../engine/chatRules.ts';
import type { ClientMessage } from '../../net/protocol.ts';
import { LIMITS, SIDE_LABEL, TEAM_LABEL } from '../../shared/config.ts';
import type { ChatChannel, ChatMessage, ClientView } from '../../shared/types.ts';
import { IconButton } from './Button.tsx';
import { IconSend } from './Icons.tsx';

type Tab = ChatChannel | 'roster';

export const CHANNEL_LABEL: Record<ChatChannel, string> = {
  global: 'Global',
  'team:crimson': 'Crimson',
  'team:cobalt': 'Cobalt',
  'side:north': SIDE_LABEL.north,
  'side:south': SIDE_LABEL.south,
  spectators: 'Observers',
  system: 'Log',
};
const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const toneClass = (m: ChatMessage) => (m.tone === 'crimson' || m.tone === 'cobalt' ? `tone-${m.tone}` : m.tone ? 'tone-agent' : '');

/** Unread counts per channel, tracked locally (reading never touches the network). */
export function useUnread(view: ClientView, visibleTab: ChatChannel | null) {
  const [lastRead, setLastRead] = useState<Record<string, number>>({});
  const latest = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of view.room.chat) out[m.channel] = Math.max(out[m.channel] ?? 0, m.at);
    return out;
  }, [view.room.chat]);
  useEffect(() => {
    if (visibleTab && (latest[visibleTab] ?? 0) > (lastRead[visibleTab] ?? 0)) setLastRead((r) => ({ ...r, [visibleTab]: latest[visibleTab] }));
  }, [visibleTab, latest, lastRead]);
  const unread: Record<string, number> = {};
  for (const m of view.room.chat) if (m.by !== view.you && m.at > (lastRead[m.channel] ?? 0)) unread[m.channel] = (unread[m.channel] ?? 0) + 1;
  return unread;
}

/**
 * Communications: team / side, global and observer chat, the automated room log, and the roster with
 * host moderation. Posting rules are shown here and enforced by the server.
 */
export function CommsPanel({ view, send, open, onToggle, onUnread }: { view: ClientView; send: (m: ClientMessage) => void; open: boolean; onToggle: () => void; onUnread?: (n: number) => void }) {
  const me = view.room.players.find((p) => p.id === view.you) ?? null;
  const channels = channelsFor(me);
  const [tab, setTab] = useState<Tab>(channels[0]);
  const active: Tab = tab === 'roster' || tab === 'system' || channels.includes(tab) ? tab : channels[0];
  const unread = useUnread(view, open && active !== 'roster' ? active : null);
  const total = channels.reduce((n, c) => n + (unread[c] ?? 0), 0);
  useEffect(() => onUnread?.(total), [total, onUnread]);
  const isHost = view.room.host.hostId === view.you;
  const tabs: Tab[] = [...channels, 'system', 'roster'];

  return (
    <section className={`comms panel ${open ? '' : 'is-collapsed'}`} aria-label="Communications">
      <header className="dock__head">
        <button type="button" className="dock__title" aria-expanded={open} onClick={onToggle}>
          <span className="dock__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
          Communications
          {!open && total > 0 && <span className="badge badge--inline">{total}</span>}
        </button>
      </header>
      {open && (
        <>
          <div className="comms__tabs" role="tablist" aria-label="Channels">
            {tabs.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={active === t} className="comms__tab" onClick={() => setTab(t)}>
                {t === 'roster' ? 'Roster' : CHANNEL_LABEL[t]}
                {t !== 'roster' && t !== 'system' && unread[t] ? <span className="badge badge--inline">{unread[t]}</span> : null}
              </button>
            ))}
          </div>
          {active === 'roster' ? (
            <Roster view={view} send={send} isHost={isHost} />
          ) : (
            <Channel view={view} channel={active} send={send} isHost={isHost} />
          )}
        </>
      )}
    </section>
  );
}

function Channel({ view, channel, send, isHost }: { view: ClientView; channel: ChatChannel; send: (m: ClientMessage) => void; isHost: boolean }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const messages = view.room.chat.filter((m) => m.channel === channel);
  const me = view.room.players.find((p) => p.id === view.you) ?? null;
  const block = channel === 'system' ? null : writeBlock({ settings: view.room.settings, match: view.match }, me, channel);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, channel]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || block) return;
    send({ t: 'chat', text: t, channel });
    setText('');
  };
  return (
    <div className="chat">
      <ol className="chat__list" ref={list} aria-label={`${CHANNEL_LABEL[channel]} messages`} aria-live="polite">
        {messages.length === 0 && <li className="meta">{channel === 'system' ? 'No events yet.' : 'No messages yet.'}</li>}
        {messages.map((m) => (
          <li key={m.id} className={`msg ${m.kind === 'system' ? 'msg--system' : ''} ${m.by === view.you ? 'msg--you' : ''} ${toneClass(m)}`}>
            {m.kind === 'system' ? (
              <p className="msg__text"><time className="msg__time">{time(m.at)}</time> {m.text}</p>
            ) : (
              <>
                <p className="msg__head">
                  <span className="msg__name">{m.name}</span>
                  <time className="msg__time">{time(m.at)}</time>
                  {isHost && <button type="button" className="msg__del" aria-label={`Remove message from ${m.name}`} onClick={() => send({ t: 'delete_message', id: m.id })}>×</button>}
                </p>
                <p className="msg__text">{m.text}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      {channel !== 'system' && (
        block ? (
          <p className="chat__blocked meta" role="note">{block}</p>
        ) : (
          <form className="chat__form" onSubmit={submit}>
            <label className="sr-only" htmlFor={`chat-${channel}`}>Message {CHANNEL_LABEL[channel]}</label>
            <input id={`chat-${channel}`} className="field" value={text} maxLength={LIMITS.chatLength} placeholder={`Message ${CHANNEL_LABEL[channel]}`} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <IconButton label="Send" type="submit" disabled={!text.trim()}>
              <IconSend />
            </IconButton>
          </form>
        )
      )}
    </div>
  );
}

function Roster({ view, send, isHost }: { view: ClientView; send: (m: ClientMessage) => void; isHost: boolean }) {
  const label = (p: ClientView['room']['players'][number]) => (p.team ? TEAM_LABEL[p.team] : p.side ? SIDE_LABEL[p.side] : 'Observer') + (p.role === 'handler' ? ' · handler' : '');
  return (
    <ul className="roster">
      {view.room.players.map((p) => (
        <li key={p.id} className={`roster__row ${p.connected ? '' : 'is-away'}`}>
          <span className="dot" aria-hidden="true" />
          <span className="roster__name">{p.name}{p.id === view.you ? ' (you)' : ''}</span>
          <span className="roster__role meta">{label(p)}{p.muted ? ' · muted' : ''}</span>
          {isHost && p.id !== view.you && (
            <button type="button" className="linkbtn" onClick={() => send({ t: 'mute', player: p.id, on: !p.muted })}>{p.muted ? 'Unmute' : 'Mute'}</button>
          )}
        </li>
      ))}
    </ul>
  );
}
