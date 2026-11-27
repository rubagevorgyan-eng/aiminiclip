import { ROOM_CODE } from '../../shared/config.ts';
import type { RoomCode } from '../../shared/types.ts';
import { Button } from './Button.tsx';
import { DecodeText } from '../fx/DecodeText.tsx';
import { planDecode } from '../fx/timing.ts';
import { sfx } from '../sound.ts';
import { IconCopy } from './Icons.tsx';

/** Room code styled as a secure access credential, with copy code / copy invitation link. */
export function AccessCode({ code, link, onCopy, decrypt = false }: { code: RoomCode; link: string; onCopy: (what: 'code' | 'link', text: string) => void; decrypt?: boolean }) {
  return (
    <section className="access" aria-label={`Room access code ${code.split('').join(' ')}`}>
      <div className="access__head">
        <span className="access__label">Access credential</span>
        <span className="access__clearance">Clearance · guest</span>
      </div>
      <div className="access__code" aria-hidden="true">
        {code.split('').map((ch, i) => (
          <span key={i} className="access__char">
            {decrypt ? <DecodeText text={ch} plan={planDecode(1, { delay: i * 200, lead: 650 })} cursor={false} seed={i} onTick={() => sfx.type()} /> : ch}
          </span>
        ))}
      </div>
      <p className="access__hint">{ROOM_CODE.length}-character code · no I, O, 0 or 1</p>
      <div className="access__actions">
        <Button size="sm" variant="secondary" onClick={() => onCopy('code', code)}>
          <IconCopy /> Code
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onCopy('link', link)}>
          <IconCopy /> Invite link
        </Button>
      </div>
    </section>
  );
}
