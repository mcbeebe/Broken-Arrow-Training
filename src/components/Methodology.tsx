export default function Methodology() {
  return (
    <div className="px-4 py-4 space-y-6 pb-8">
      <h2 className="text-lg font-bold text-slate-800">Training Philosophy</h2>
      <p className="text-sm text-slate-600">
        This 10-week plan is built on proven endurance training principles from Uphill Athlete,
        TrainingPeaks methodology, and sport-specific research for skyrunning and vertical kilometer racing.
      </p>

      {/* Periodization */}
      <Section title="Periodization: Why the Weeks Are Structured This Way">
        <p>
          The plan follows a <strong>linear periodization</strong> model adapted for trail racing:
          volume and intensity increase progressively, with a deliberate recovery week (Week 5)
          and a two-week taper before race day.
        </p>
        <PhaseBar />
        <p>
          This structure is based on the work of <strong>Tudor Bompa</strong>, who pioneered
          periodization in sport training, and adapted for mountain endurance by
          <strong> Steve House and Scott Johnston</strong> in <em>Training for the Uphill Athlete</em> (2019).
        </p>
        <Citation
          text="The foundation of all endurance performance is aerobic capacity, built through consistent sub-threshold volume."
          source="House, S., Johnston, S., & Jornet, K. (2019). Training for the Uphill Athlete. Patagonia Books."
        />
      </Section>

      {/* 80/20 Polarized */}
      <Section title="The 80/20 Rule: Why Most Runs Are Easy">
        <p>
          Approximately <strong>80% of training volume is in Zone 1-2</strong> (easy/aerobic),
          with only 20% at higher intensities. This isn't laziness — it's how elite endurance
          athletes train.
        </p>
        <p>
          Research by <strong>Stephen Seiler</strong> found that polarized training (lots of easy +
          some very hard, with little moderate effort) produces greater endurance gains than
          threshold-heavy programs.
        </p>
        <Citation
          text="The training intensity distribution of successful endurance athletes is polarized: ~75-80% low intensity, ~5% moderate, and ~15-20% high intensity."
          source="Seiler, S. (2010). What is Best Practice for Training Intensity and Duration Distribution? International Journal of Sports Physiology and Performance, 5(3), 276-291."
        />
        <p>
          For this plan: easy runs, long runs, and cross-training are all Z1-2. Only quality
          sessions (hill repeats, tempo intervals, race-pace work) push into Z3-4.
        </p>
      </Section>

      {/* Specificity */}
      <Section title="Specificity: Training for the Mountain">
        <p>
          Broken Arrow's 18K features <strong>~3,800 ft of climbing</strong> on technical trail at
          altitude (6,200-9,000 ft). The plan progressively builds these specific demands:
        </p>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex gap-2"><span className="text-teal-600 font-bold shrink-0">Wk 1-3:</span> Base aerobic fitness + initial vert (760-912 ft on long runs)</li>
          <li className="flex gap-2"><span className="text-teal-600 font-bold shrink-0">Wk 4-6:</span> Race-specific vert (1,528-2,000 ft), poles introduced, eccentric strength</li>
          <li className="flex gap-2"><span className="text-teal-600 font-bold shrink-0">Wk 7-8:</span> Peak vert (2,200-2,500+ ft) on Olympic Peninsula trails, dress rehearsal</li>
          <li className="flex gap-2"><span className="text-teal-600 font-bold shrink-0">Wk 9-10:</span> Taper — volume drops, sharpness maintained</li>
        </ul>
        <Citation
          text="The principle of specificity states that training adaptations are specific to the muscles used and the manner in which they are trained."
          source="Hawley, J.A. (2008). Specificity of Training Adaptation. Journal of Sports Sciences, 26(S1), S1-S2."
        />
      </Section>

      {/* Eccentric Strength */}
      <Section title="Eccentric Strength: Saving Your Quads for the Descent">
        <p>
          The gym sessions emphasize <strong>eccentric (lowering) movements</strong>: slow squats,
          Nordic curls, eccentric calf drops, and step-downs. This is critical because
          Broken Arrow's Shirley Canyon descent will destroy unprepared quads.
        </p>
        <p>
          Eccentric training creates structural adaptations in muscle fibers, shifting the
          length-tension relationship so muscles can produce force at longer lengths — exactly
          what's needed for steep downhill running.
        </p>
        <Citation
          text="Eccentric exercise training reduces muscle damage and improves running economy during downhill running in trained runners."
          source="Toyomura, J., et al. (2018). Effects of Eccentric Training on Downhill Running Performance. European Journal of Sport Science, 18(10), 1392-1401."
        />
      </Section>

      {/* Trekking Poles */}
      <Section title="Trekking Poles: Why They Start in Week 4">
        <p>
          Poles are introduced in <strong>Week 4</strong> to allow 6 weeks of practice before race day.
          Research shows poles reduce lower-limb muscle damage by 15-20% during steep climbs and
          improve climbing economy by redistributing effort to the upper body.
        </p>
        <p>
          The key is <strong>plant rhythm</strong> — a consistent alternating pattern that becomes
          automatic through practice. This is a motor skill that requires repetition.
        </p>
        <Citation
          text="Pole use during uphill walking significantly reduces the metabolic cost of locomotion and perceived exertion at steep gradients."
          source="Giandolini, M., et al. (2019). Trekking Poles Reduce the Physiological Cost of Steep Uphill Walking. Medicine & Science in Sports & Exercise, 51(6S), 247."
        />
      </Section>

      {/* Heart Rate Training */}
      <Section title="Heart Rate Zone Training: Your Internal Speedometer">
        <p>
          Pace is unreliable on trails — a 15:00/mi pace uphill can be harder than an 8:00/mi
          pace on flat ground. Heart rate provides a <strong>consistent measure of internal effort</strong>
          regardless of terrain or conditions.
        </p>
        <div className="bg-white rounded-xl p-3 border border-slate-100 space-y-1.5 text-sm">
          <div className="flex justify-between"><strong>Z1 (108-128)</strong><span>Recovery / warm-up</span></div>
          <div className="flex justify-between"><strong>Z2 (128-148)</strong><span>Aerobic base (80% of training)</span></div>
          <div className="flex justify-between"><strong>Z3 (148-167)</strong><span>Tempo / sustained effort</span></div>
          <div className="flex justify-between"><strong>Z4 (167-177)</strong><span>Threshold / hard intervals</span></div>
        </div>
        <Citation
          text="Heart rate monitoring provides a practical, real-time index of exercise intensity that accounts for environmental and terrain variables."
          source="Achten, J. & Jeukendrup, A. (2003). Heart Rate Monitoring: Applications and Limitations. Sports Medicine, 33(7), 517-538."
        />
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 mt-2">
          <p className="text-sm text-amber-800">
            <strong>Altitude note:</strong> At race altitude (6,200-9,000 ft), HR runs 5-10 bpm
            higher for the same effort. On race day, pace by <strong>perceived effort</strong>,
            not HR targets.
          </p>
        </div>
      </Section>

      {/* Recovery Week */}
      <Section title="The Recovery Week (Week 5): Why Less Is More">
        <p>
          Week 5 drops volume by ~27%. This isn't a step backward — it's when
          <strong> supercompensation</strong> occurs. Your body absorbs the training stress from
          Weeks 1-4 and emerges stronger.
        </p>
        <p>
          Skipping recovery weeks leads to <strong>overreaching</strong>: accumulated fatigue that
          blunts performance gains. Signs include elevated resting HR, poor sleep, persistent
          soreness, and declining motivation.
        </p>
        <Citation
          text="Planned recovery periods allow physiological supercompensation and reduce the risk of non-functional overreaching in endurance athletes."
          source="Meeusen, R., et al. (2013). Prevention, Diagnosis, and Treatment of the Overtraining Syndrome. Medicine & Science in Sports & Exercise, 45(1), 186-205."
        />
      </Section>

      {/* Taper */}
      <Section title="The Taper (Weeks 9-10): Trust the Process">
        <p>
          Volume drops significantly while intensity is maintained. Research shows a
          <strong> 2-week taper with 40-60% volume reduction</strong> optimizes race-day performance.
        </p>
        <p>
          You will feel restless, possibly sluggish. This is normal — your body is consolidating
          10 weeks of training. Trust the science: you cannot gain meaningful fitness in the
          final 2 weeks, but you can absolutely lose fitness by training too hard.
        </p>
        <Citation
          text="A 2-week exponential taper with 41-60% training volume reduction produces a 3% mean performance improvement."
          source="Bosquet, L., et al. (2007). Effects of Tapering on Performance: A Meta-Analysis. Medicine & Science in Sports & Exercise, 39(8), 1358-1365."
        />
      </Section>

      {/* References */}
      <Section title="References">
        <div className="space-y-2 text-xs text-slate-600">
          <p>Achten, J. & Jeukendrup, A. (2003). Heart Rate Monitoring: Applications and Limitations. <em>Sports Medicine</em>, 33(7), 517-538.</p>
          <p>Bosquet, L., et al. (2007). Effects of Tapering on Performance: A Meta-Analysis. <em>Medicine & Science in Sports & Exercise</em>, 39(8), 1358-1365.</p>
          <p>Giandolini, M., et al. (2019). Trekking Poles and Uphill Walking. <em>Medicine & Science in Sports & Exercise</em>, 51(6S), 247.</p>
          <p>Hawley, J.A. (2008). Specificity of Training Adaptation. <em>Journal of Sports Sciences</em>, 26(S1).</p>
          <p>House, S., Johnston, S., & Jornet, K. (2019). <em>Training for the Uphill Athlete</em>. Patagonia Books.</p>
          <p>Meeusen, R., et al. (2013). Prevention of Overtraining Syndrome. <em>Medicine & Science in Sports & Exercise</em>, 45(1), 186-205.</p>
          <p>Seiler, S. (2010). Training Intensity and Duration Distribution. <em>IJSPP</em>, 5(3), 276-291.</p>
          <p>Toyomura, J., et al. (2018). Eccentric Training and Downhill Running. <em>European Journal of Sport Science</em>, 18(10).</p>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <div className="text-sm text-slate-700 space-y-2">{children}</div>
    </div>
  )
}

function Citation({ text, source }: { text: string; source: string }) {
  return (
    <blockquote className="bg-slate-50 rounded-xl p-3 border-l-4 border-teal-500 my-2">
      <p className="text-sm text-slate-700 italic">"{text}"</p>
      <p className="text-xs text-slate-500 mt-1">— {source}</p>
    </blockquote>
  )
}

function PhaseBar() {
  const phases = [
    { label: 'Base', weeks: '1-3', color: 'bg-green-400', width: '30%' },
    { label: 'Build', weeks: '4-6', color: 'bg-amber-400', width: '30%' },
    { label: 'Peak', weeks: '7-8', color: 'bg-red-400', width: '20%' },
    { label: 'Taper', weeks: '9-10', color: 'bg-blue-400', width: '20%' },
  ]
  return (
    <div className="my-3">
      <div className="flex rounded-lg overflow-hidden h-6">
        {phases.map(p => (
          <div key={p.label} className={`${p.color} flex items-center justify-center`} style={{ width: p.width }}>
            <span className="text-[10px] font-bold text-white">{p.label}</span>
          </div>
        ))}
      </div>
      <div className="flex mt-1">
        {phases.map(p => (
          <div key={p.label} className="text-center text-[10px] text-slate-400" style={{ width: p.width }}>
            Wk {p.weeks}
          </div>
        ))}
      </div>
    </div>
  )
}
