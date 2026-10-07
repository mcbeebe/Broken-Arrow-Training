import { MAKE, type TraitId } from '../content'

interface Props {
  coachName: string
  traits: ReadonlySet<TraitId>
  /** Wired in initiative 003 PR 4; until then the panel shows its default state. */
  onNameChange?: (name: string) => void
  onToggleTrait?: (id: TraitId) => void
}

/** Name the demo coach and pick its personality (design-spec.md § MakeItYours). */
export function MakeItYours({ coachName, traits, onNameChange, onToggleTrait }: Props) {
  return (
    <section className="bg-landing-card">
      <div className="mx-auto flex max-w-landing flex-wrap items-center gap-14 px-6 py-[88px]">
        <div className="min-w-0 flex-[1_1_380px]">
          <h2 className="m-0 text-[clamp(32px,4vw,48px)] font-extrabold leading-[1.05] tracking-[-0.03em]">{MAKE.title}</h2>
          <p className="m-0 mt-4 max-w-[30em] text-lg leading-[1.55] text-landing-muted">{MAKE.body}</p>
        </div>
        <div className="min-w-0 flex-[1_1_420px] rounded-3xl bg-landing-soft p-7">
          <label htmlFor="coach-name" className="text-[15px] font-semibold">
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
              const on = traits.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={onToggleTrait ? () => onToggleTrait(t.id) : undefined}
                  className={`h-11 cursor-pointer rounded-full border-[1.5px] border-solid px-4 text-[15px] font-semibold ${
                    on
                      ? 'border-landing-action bg-landing-action text-landing-action-text'
                      : 'border-landing-input-border-soft bg-landing-card text-landing-ink'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
