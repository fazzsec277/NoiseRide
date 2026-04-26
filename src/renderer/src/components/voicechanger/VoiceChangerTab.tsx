import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import styles from './VoiceChangerTab.module.css'

function buildAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key === ' ' ? 'Space' : e.key)
  return parts.join('+')
}

function semitoneLabel(v: number): string {
  return (v > 0 ? '+' : '') + v + ' st'
}

function dbLabel(v: number): string {
  return (v > 0 ? '+' : '') + v + ' dB'
}

interface SliderRowProps {
  label: string
  desc?: string
  min: number
  max: number
  step: number
  value: number
  valueLabel: string
  onChange: (v: number) => void
}

function SliderRow({ label, desc, min, max, step, value, valueLabel, onChange }: SliderRowProps): JSX.Element {
  return (
    <div className={styles.rowWrapper}>
      <div className={styles.row}>
        <label className={styles.label}>{label}</label>
        <div className={styles.sliderGroup}>
          <span className={styles.pitchEdge}>{min > 0 ? `+${min}` : min}</span>
          <input
            type="range"
            className={styles.slider}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className={styles.pitchEdge}>{max > 0 ? `+${max}` : max}</span>
          <span className={styles.sliderValue}>{valueLabel}</span>
        </div>
      </div>
      {desc && <p className={styles.paramDesc}>{desc}</p>}
    </div>
  )
}

export function VoiceChangerTab(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      const acc = buildAccelerator(e)
      updateSettings({ micPushToKeyBind: acc })
      window.api.ptk.setKey(acc).catch(() => {})
      setRecording(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [recording, updateSettings])

  const clearBind = (): void => updateSettings({ micPushToKeyBind: '' })

  return (
    <div className={styles.container}>

      {/* ── Push to Key ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Push to Key</h2>
        <p className={styles.paramDesc} style={{ paddingLeft: 0 }}>キーを押している間だけマイクをオンにするモード</p>

        <div className={styles.row}>
          <label className={styles.label}>モード</label>
          <div className={styles.modeGroup}>
            <button
              className={`${styles.modeBtn} ${!settings.micPushToKey ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micPushToKey: false })}
            >
              常時有効
            </button>
            <button
              className={`${styles.modeBtn} ${settings.micPushToKey ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micPushToKey: true })}
            >
              Push to Key
            </button>
          </div>
        </div>

        {settings.micPushToKey && (
          <div className={styles.row}>
            <label className={styles.label}>キー</label>
            <div className={styles.keyGroup}>
              {settings.micPushToKeyBind && (
                <>
                  <span className={styles.keyBadge}>{settings.micPushToKeyBind}</span>
                  <button className={styles.clearBtn} onClick={clearBind} title="クリア">×</button>
                </>
              )}
              <button
                className={`${styles.recordBtn} ${recording ? styles.recordBtnActive : ''}`}
                onClick={() => setRecording((r) => !r)}
              >
                {recording ? 'キー入力待ち...' : settings.micPushToKeyBind ? '変更' : 'キーを記録'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Pitch / Formant ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ピッチ・フォルマント</h2>

        <SliderRow
          label="ピッチ"
          desc="声の高さ。+で高く、−で低くなる"
          min={-12} max={12} step={1}
          value={settings.micPitchSemitones}
          valueLabel={semitoneLabel(settings.micPitchSemitones)}
          onChange={(v) => updateSettings({ micPitchSemitones: v })}
        />

        <SliderRow
          label="フォルマント"
          desc="声の太さと響き。+で細く明るく、−で太く暗くなる"
          min={-12} max={12} step={1}
          value={settings.micFormantSemitones}
          valueLabel={semitoneLabel(settings.micFormantSemitones)}
          onChange={(v) => updateSettings({ micFormantSemitones: v })}
        />
      </section>

      {/* ── EQ ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>イコライザー</h2>

        <SliderRow
          label="Low"
          desc="低音域（ドスン・ズン系の音）の強弱"
          min={-12} max={12} step={1}
          value={settings.micEqLow}
          valueLabel={dbLabel(settings.micEqLow)}
          onChange={(v) => updateSettings({ micEqLow: v })}
        />

        <SliderRow
          label="Mid"
          desc="中音域（声の芯となる帯域）の強弱"
          min={-12} max={12} step={1}
          value={settings.micEqMid}
          valueLabel={dbLabel(settings.micEqMid)}
          onChange={(v) => updateSettings({ micEqMid: v })}
        />

        <SliderRow
          label="High"
          desc="高音域（シャリシャリ・サ行の音）の強弱"
          min={-12} max={12} step={1}
          value={settings.micEqHigh}
          valueLabel={dbLabel(settings.micEqHigh)}
          onChange={(v) => updateSettings({ micEqHigh: v })}
        />
      </section>

      {/* ── Distortion ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ディストーション</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micDistortionEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micDistortionEnabled: !settings.micDistortionEnabled })}
            >
              {settings.micDistortionEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>声に電気的な歪みを加えてエレクトロ・ロック風にする</p>
        </div>

        {settings.micDistortionEnabled && (
          <>
            <SliderRow
              label="Drive"
              desc="歪みの強さ。高いほど荒々しく激しい音になる"
              min={0} max={100} step={1}
              value={settings.micDistortionDrive}
              valueLabel={`${settings.micDistortionDrive} %`}
              onChange={(v) => updateSettings({ micDistortionDrive: v })}
            />
            <SliderRow
              label="Mix"
              desc="元の声と歪んだ声の割合（0%=原音のみ、100%=歪みのみ）"
              min={0} max={100} step={1}
              value={settings.micDistortionMix}
              valueLabel={`${settings.micDistortionMix} %`}
              onChange={(v) => updateSettings({ micDistortionMix: v })}
            />
            <SliderRow
              label="Tone"
              desc="歪み後の高音の量。低いとこもった音、高いと刺さる音"
              min={0} max={100} step={1}
              value={settings.micDistortionTone}
              valueLabel={`${settings.micDistortionTone} %`}
              onChange={(v) => updateSettings({ micDistortionTone: v })}
            />
          </>
        )}
      </section>

      {/* ── Compressor ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>コンプレッサー</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micCompressorEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micCompressorEnabled: !settings.micCompressorEnabled })}
            >
              {settings.micCompressorEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>大きい音を自動で抑えて声の音量を均一にする</p>
        </div>

        {settings.micCompressorEnabled && (
          <>
            <SliderRow
              label="Threshold"
              desc="この音量以上の声を圧縮する（低いほど小さい音も圧縮）"
              min={-60} max={0} step={1}
              value={settings.micCompressorThreshold}
              valueLabel={`${settings.micCompressorThreshold} dB`}
              onChange={(v) => updateSettings({ micCompressorThreshold: v })}
            />
            <SliderRow
              label="Ratio"
              desc="圧縮の強さ（高いほど音量が均一になる）"
              min={1} max={20} step={1}
              value={settings.micCompressorRatio}
              valueLabel={`${settings.micCompressorRatio} : 1`}
              onChange={(v) => updateSettings({ micCompressorRatio: v })}
            />
            <SliderRow
              label="Attack"
              desc="圧縮が始まるまでの速さ（低いほど素早く反応）"
              min={0} max={100} step={1}
              value={settings.micCompressorAttack}
              valueLabel={`${settings.micCompressorAttack} ms`}
              onChange={(v) => updateSettings({ micCompressorAttack: v })}
            />
            <SliderRow
              label="Release"
              desc="圧縮が解除されるまでの速さ（低いほど素早く元に戻る）"
              min={10} max={500} step={10}
              value={settings.micCompressorRelease}
              valueLabel={`${settings.micCompressorRelease} ms`}
              onChange={(v) => updateSettings({ micCompressorRelease: v })}
            />
          </>
        )}
      </section>

      {/* ── Radio ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ラジオ効果</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micRadioEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micRadioEnabled: !settings.micRadioEnabled })}
            >
              {settings.micRadioEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>電話帯域（300–3000 Hz）だけ通すトランシーバー風の音質</p>
        </div>
      </section>

      {/* ── Echo ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>エコー</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micEchoEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micEchoEnabled: !settings.micEchoEnabled })}
            >
              {settings.micEchoEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>声が一定時間後に繰り返されるやまびこ効果</p>
        </div>

        {settings.micEchoEnabled && (
          <>
            <SliderRow
              label="Delay"
              desc="やまびこが返ってくるまでの時間"
              min={50} max={500} step={10}
              value={settings.micEchoDelay}
              valueLabel={`${settings.micEchoDelay} ms`}
              onChange={(v) => updateSettings({ micEchoDelay: v })}
            />
            <SliderRow
              label="Feedback"
              desc="繰り返しの回数（高いほど長く続く）"
              min={0} max={80} step={1}
              value={settings.micEchoFeedback}
              valueLabel={`${settings.micEchoFeedback} %`}
              onChange={(v) => updateSettings({ micEchoFeedback: v })}
            />
            <SliderRow
              label="Mix"
              desc="原音とエコー音の割合（0%=原音のみ、100%=エコーのみ）"
              min={0} max={100} step={1}
              value={settings.micEchoMix}
              valueLabel={`${settings.micEchoMix} %`}
              onChange={(v) => updateSettings({ micEchoMix: v })}
            />
          </>
        )}
      </section>

      {/* ── Reverb ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>リバーブ</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micReverbEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micReverbEnabled: !settings.micReverbEnabled })}
            >
              {settings.micReverbEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>部屋やホールの残響をシミュレートして空間を演出する</p>
        </div>

        {settings.micReverbEnabled && (
          <>
            <SliderRow
              label="Duration"
              desc="残響の長さ（長いほどホールのような響きになる）"
              min={0.5} max={4.0} step={0.1}
              value={settings.micReverbDuration}
              valueLabel={`${settings.micReverbDuration.toFixed(1)} s`}
              onChange={(v) => updateSettings({ micReverbDuration: v })}
            />
            <SliderRow
              label="Decay"
              desc="残響の減衰速度（高いほど素早く消える）"
              min={1} max={5} step={0.5}
              value={settings.micReverbDecay}
              valueLabel={`${settings.micReverbDecay}`}
              onChange={(v) => updateSettings({ micReverbDecay: v })}
            />
            <SliderRow
              label="Mix"
              desc="原音と残響の割合（0%=原音のみ、100%=残響のみ）"
              min={0} max={100} step={1}
              value={settings.micReverbMix}
              valueLabel={`${settings.micReverbMix} %`}
              onChange={(v) => updateSettings({ micReverbMix: v })}
            />
          </>
        )}
      </section>

      {/* ── Robot ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>ロボット声</h2>

        <div className={styles.rowWrapper}>
          <div className={styles.row}>
            <label className={styles.label}>有効</label>
            <button
              className={`${styles.modeBtn} ${settings.micRobotEnabled ? styles.modeBtnActive : ''}`}
              onClick={() => updateSettings({ micRobotEnabled: !settings.micRobotEnabled })}
            >
              {settings.micRobotEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className={styles.paramDesc}>一定周波数の信号を掛け合わせて機械的・金属的な声にする</p>
        </div>

        {settings.micRobotEnabled && (
          <SliderRow
            label="Frequency"
            desc="ロボット感の周波数（低いほど重い機械音、高いほど金属的）"
            min={50} max={300} step={5}
            value={settings.micRobotFrequency}
            valueLabel={`${settings.micRobotFrequency} Hz`}
            onChange={(v) => updateSettings({ micRobotFrequency: v })}
          />
        )}
      </section>

    </div>
  )
}
