import { useState } from 'react';
import { Button } from '../../components/Button.tsx';
import { Dossier } from '../../components/Dossier.tsx';
import { NameField } from '../../components/NameField.tsx';
import { loadName, loadSettings, saveName, saveSettings } from '../../storage.ts';

/** Device settings: code name and reduced motion. Nothing leaves this device. */
export function SettingsDialog({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(loadName);
  const [settings, setSettings] = useState(loadSettings);
  const save = () => {
    saveName(name);
    saveSettings(settings);
    onDone();
  };
  return (
    <Dossier tab="SETTINGS" title="Settings">
      <div className="form">
        <NameField value={name} onChange={setName} id="settings-name" />
        <label className="check">
          <input type="checkbox" checked={settings.animations} onChange={(e) => setSettings({ ...settings, animations: e.target.checked })} />
          <span>
            <b>Terminal animations</b>
            <span className="meta">Decoding text, card reveals and mission banners. Off shows results instantly.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => setSettings({ ...settings, reduceMotion: e.target.checked })} />
          <span>
            <b>Reduce motion</b>
            <span className="meta">Turns off decoding and moving effects. Your system setting is always respected.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} />
          <span>
            <b>Sound effects</b>
            <span className="meta">Typing, paper, radio clicks, stamps and short tones. Never background noise.</span>
          </span>
        </label>
        <label className="formfield" htmlFor="settings-volume">
          <span className="formfield__label">Volume {Math.round(settings.volume * 100)}%</span>
          <input id="settings-volume" type="range" min={0} max={1} step={0.05} value={settings.volume} disabled={!settings.sound} onChange={(e) => setSettings({ ...settings, volume: Number(e.target.value) })} />
        </label>
        <p className="meta">Saved on this device only. Cipher has no accounts. Press Esc or click to skip a long animation.</p>
      </div>
      <div className="modal__actions">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={save}>Save</Button>
      </div>
    </Dossier>
  );
}
