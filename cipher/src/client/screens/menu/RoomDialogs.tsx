import { useState, type FormEvent } from 'react';
import { MODES, MODE_ORDER } from '../../../engine/modes/index.ts';
import { RoomError, type RoomService } from '../../../net/service.ts';
import { ROOM_CODE } from '../../../shared/config.ts';
import { normalizeRoomCode } from '../../../shared/ids.ts';
import { cleanName } from '../../../shared/text.ts';
import type { ModeId } from '../../../shared/types.ts';
import { Button } from '../../components/Button.tsx';
import { Dossier } from '../../components/Dossier.tsx';
import { NameField } from '../../components/NameField.tsx';
import { Segmented } from '../../components/Segmented.tsx';
import { navigate } from '../../route.ts';
import { loadName, saveName } from '../../storage.ts';

/** Create a private room: code name + mode. */
export function CreateRoomDialog({ service, initialMode, onCancel }: { service: RoomService | null; initialMode: ModeId; onCancel: () => void }) {
  const [name, setName] = useState(loadName);
  const [mode, setMode] = useState<ModeId>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setError('Enter a code name first.');
    if (!service) return;
    setBusy(true);
    setError('');
    saveName(clean);
    try {
      const code = await service.createRoom({ name: clean, mode });
      sessionStorage.setItem('cipher.fx.created', code);
      navigate({ name: 'room', code });
    } catch (err) {
      setError(err instanceof RoomError ? err.message : 'Could not open a secure line. Try again.');
      setBusy(false);
    }
  };

  return (
    <Dossier tab="NEW OPERATION" title="Create a private room">
      <form className="form" onSubmit={submit}>
        <NameField value={name} onChange={(v) => (setName(v), setError(''))} autoFocus />
        <div className="formfield">
          <span className="formfield__label">Mode</span>
          <Segmented<ModeId> label="Mode" value={mode} onChange={setMode} options={MODE_ORDER.map((id) => ({ value: id, label: MODES[id].label }))} />
          <span className="meta">{MODES[mode].summary}. You can change settings in the lobby.</span>
        </div>
        {!service && <p className="notice" role="status">Online rooms are not open yet: the secure room server is still being built.</p>}
        {error && <p className="feedback" role="alert">{error}</p>}
        <div className="modal__actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={!service || busy}>{busy ? 'Opening channel…' : 'Create room'}</Button>
        </div>
      </form>
    </Dossier>
  );
}

/** Join with a code (invitation links skip this and land in the room flow directly). */
export function JoinRoomDialog({ onCancel }: { onCancel: () => void }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) return setError('Enter a code name first.');
    const room = normalizeRoomCode(code);
    if (!room) return setError(`Access codes are ${ROOM_CODE.length} characters, letters and digits 2–9.`);
    saveName(clean);
    navigate({ name: 'room', code: room });
  };
  return (
    <Dossier tab="CHECKPOINT" title="Join a room">
      <form className="form" onSubmit={submit}>
        <NameField value={name} onChange={(v) => (setName(v), setError(''))} autoFocus={!loadName()} />
        <label className="formfield" htmlFor="join-code">
          <span className="formfield__label">Access code</span>
          <input id="join-code" className="field field--code field--credential" value={code} maxLength={ROOM_CODE.length + 2} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="•••••" autoFocus={!!loadName()} onChange={(e) => (setCode(e.target.value), setError(''))} />
        </label>
        {error && <p className="feedback" role="alert">{error}</p>}
        <div className="modal__actions">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Join room</Button>
        </div>
      </form>
    </Dossier>
  );
}
