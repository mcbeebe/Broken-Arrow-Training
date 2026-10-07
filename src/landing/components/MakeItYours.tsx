import { MAKE, type PersonalityId } from '../content'

interface Props {
  coachName: string
  personality: PersonalityId
  /** No more personality changes this visit: the buttons stay focusable but do nothing. */
  limitReached?: boolean
  /** Without it the name field is read-only. */
  onNameChange?: (name: string) => void
  onPickPersonality?: (id: PersonalityId) => void
}

/** Name the demo coach and pick one personality; the chat beside it answers in that voice (design-spec.md § MakeItYours). */
export function MakeItYours({ coachName, personality, limitReached = false, onNameChange, onPickPersonality }: Props) {
  return (
    <div className="mt-8 rounded-3xl bg-landing-soft p-7">
      <h3 className="m-0 text-[clamp(24px,2.6vw,30px)] font-extrabold tracking-[-0.03em]">{MAKE.title}</h3>
      <p className="m-0 mt-2 text-base leading-[1.55] text-landing-muted">{MAKE.body}</p>
      <label htmlFor="coach-name" className="mt-5 block text-[15px] font-semibold">
        {MAKE.nameLabel}
      </label>
      <input
        id="coach-name"
        type="text"
        maxLength={MAKE.nameMaxLength}
        value={coachName}
        readOnly={!onNameChange}
        onChange={onNameChange ? e => onNameChange(e.target.value) : undefined}
        className="mt-2 box-border block h-12 w-full rounded-[10px] border-[1.5px] border-solid border-landing-input-border-soft bg-landing-card px-3.5 text-[19px] font-semibold text-landing-ink"
      />
      <p className="m-0 mb-2.5 mt-5 text-[15px] font-semibold">
        <span id="coach-traits">{MAKE.groupLabel}</span>{' '}
        <span id="coach-traits-hint" className="font-normal text-landing-muted">
          {MAKE.hint}
        </span>
      </p>
      <div role="group" aria-labelledby="coach-traits" aria-describedby="coach-traits-hint" className="flex flex-wrap gap-2">
        {MAKE.traits.map(t => {
          const on = t.id === personality
          const blocked = limitReached && !on
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              aria-disabled={blocked || undefined}
              onClick={onPickPersonality && !blocked ? () => onPickPersonality(t.id) : undefined}
              className={`h-11 rounded-full border-[1.5px] border-solid px-4 text-[15px] font-semibold ${
                on
                  ? 'border-landing-action bg-landing-action text-landing-action-text'
                  : 'border-landing-input-border-soft bg-landing-card text-landing-ink'
              } ${blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
