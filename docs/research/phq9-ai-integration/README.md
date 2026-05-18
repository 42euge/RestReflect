# PHQ-9 Integration in RestReflect AI Companion

Research findings on using PHQ-9 depression screening scores as soft context
for the deep-reflect therapeutic persona.

---

## 1. PHQ-9 Scoring and Validation Summary

### What is the PHQ-9?

The Patient Health Questionnaire-9 is a 9-item self-administered depression
screening tool. Each item is scored 0-3 based on symptom frequency over the
past two weeks (0 = not at all, 1 = several days, 2 = more than half the days,
3 = nearly every day). Total score ranges from 0 to 27.

### Severity Bands

| Score  | Severity          | Suggested Clinical Action                     |
|--------|-------------------|-----------------------------------------------|
| 0-4    | Minimal           | No action; monitor if concerns persist        |
| 5-9    | Mild              | Watchful waiting; supportive coping           |
| 10-14  | Moderate          | Treatment plan (counseling, regular check-ins)|
| 15-19  | Moderately Severe | Active treatment (therapy + medication eval)  |
| 20-27  | Severe            | Immediate active treatment, specialist referral|

### Validation Data

- **Sensitivity**: 88% for major depression at cutoff >= 10
- **Specificity**: 88% at the same cutoff
- **Cronbach's alpha**: 0.89 (excellent internal consistency)
- **Test-retest reliability**: r = 0.84 over 48 hours
- **Self-administration**: Validated for self-administration (originally
  designed as part of the self-administered PHQ). Takes < 3 minutes.

### Key Limitation

The PHQ-9 is a screening and severity-tracking tool, NOT a diagnostic
instrument. A diagnosis of major depressive disorder requires a clinical
interview using DSM-5-TR or ICD-11 criteria. This is critical for RestReflect:
the persona must never treat a PHQ-9 score as a diagnosis.

---

## 2. Item 9 Safety Protocol

### The Problem

Item 9 asks: "Thoughts that you would be better off dead, or of hurting
yourself in some way." Any score > 0 on this item requires special handling,
regardless of the total score.

### Research Findings

- Item 9 has **sensitivity of 87.6%** and **specificity of 66.1%** when
  validated against the Columbia Suicide Severity Rating Scale (C-SSRS).
- Item 9 tends to over-identify suicide risk (high false positive rate).
- Despite limitations, it is a legitimate screening trigger that should
  never be ignored.
- Clinical guidelines require that any positive response to Item 9 trigger
  further assessment by a qualified professional.

### Protocol for phq-9000 (iOS app)

When Item 9 score > 0:

1. **Immediate in-app response** (in phq-9000):
   - Display crisis resources prominently (not buried in menus)
   - Show: 988 Suicide & Crisis Lifeline (call/text 988)
   - Show: Crisis Text Line (text HOME to 741741)
   - Normalize reaching out: "Many people have these thoughts. Talking to
     someone can help."
   - Do NOT lock the user out of the app or make them feel punished.

2. **Data transmitted to RestReflect**:
   - The `item9_positive` flag (boolean) is transmitted as part of the
     score context.
   - The raw item 9 score (0-3) is transmitted.
   - Timestamp of when it was last positive.

3. **RestReflect persona behavior when item9_positive is true**:
   - The persona does NOT mention the PHQ-9 score or item 9 directly.
   - The persona becomes more attentive to hopelessness themes in
     conversation.
   - If the user expresses hopelessness, the persona gently surfaces
     crisis resources using warm, non-paternalistic language (see Section 6).
   - The persona NEVER attempts to assess suicide risk itself.
   - The persona NEVER asks "are you thinking about hurting yourself?"
     based on the score alone.

### Legal/Ethical Considerations

- RestReflect is NOT a medical device and does not provide clinical care.
- The system does not have mandatory reporting obligations (it is not a
  licensed clinician).
- However, failing to surface crisis resources when aware of suicidal
  ideation could create liability.
- The safest posture: always make crisis resources easily accessible,
  never suppress or hide them, never claim to handle crisis situations.

---

## 3. Ethical Guidelines for PHQ-9 in AI Systems

### What Comparable Apps Do

| App    | Approach                                                        |
|--------|-----------------------------------------------------------------|
| Woebot | Detects crisis keywords, immediately provides hotline numbers,  |
|        | states it cannot help in crisis, invites user to call hotline.  |
|        | Does NOT continue therapeutic conversation during crisis.       |
| Wysa   | Makes clear it cannot help in crisis or severe mental health.   |
|        | Tracks PHQ-9/GAD-7 for outcome measurement.                    |

### APA Guidance (2024-2025)

- AI should augment, not replace, human decision-making.
- Practitioners must maintain professional oversight.
- Informed consent required for any AI processing of clinical data.
- Systems must be evaluated for quality, performance, and appropriateness.
- Data must comply with privacy regulations (HIPAA in US context).

### Key Distinctions for RestReflect

| Scenario                          | Risk Level | RestReflect Approach       |
|-----------------------------------|------------|----------------------------|
| AI administers the PHQ-9          | Higher     | We do NOT do this.         |
| AI displays/interprets scores     | Higher     | We do NOT do this.         |
| AI knows severity band only       | Lower      | This is our approach.      |
| AI knows item-level scores        | Moderate   | Only item 9 flag needed.   |

**Critical distinction**: phq-9000 (iOS) administers the test. RestReflect
(macOS) only receives a severity band and safety flag. The persona never
discusses scores, never references the PHQ-9 by name, and never tells the
user their depression level.

---

## 4. How to Surface Scores to the Persona

### What to Transmit

Send to the deep-reflect persona as system context:

```
mood_context:
  severity_band: "moderate"  # one of: minimal, mild, moderate, moderately_severe, severe
  item9_flag: true           # boolean: was item 9 > 0 on most recent administration?
  item9_last_positive: "2025-01-15"  # ISO date, or null
  last_assessment: "2025-01-20"      # when the PHQ-9 was last completed
  trend: "improving"         # one of: improving, stable, worsening, insufficient_data
```

### What NOT to Transmit

- Raw total score (the persona does not need numeric precision)
- Individual item scores (except the item 9 boolean flag)
- Historical score array (trend summary is sufficient)
- The user's answers to individual questions

### Persona Context Injection (System Prompt Fragment)

```
You have access to a mood context signal from the user's self-assessment tool.
This is NOT a diagnosis. It reflects the user's self-reported symptom severity
over the past two weeks.

Current context:
- Mood band: {severity_band}
- Safety flag: {item9_flag}
- Trend: {trend}
- Last assessment: {last_assessment}

Guidelines for using this context:
- NEVER mention the PHQ-9, scores, severity bands, or assessment tools.
- NEVER say "your depression score" or "based on your assessment."
- NEVER diagnose or label the user's mental state.
- Use this to calibrate your attentiveness and sensitivity, not your content.
- If severity is moderate or higher: be more attentive to hopelessness themes,
  more proactive about suggesting professional support if themes escalate.
- If the safety flag is true: be vigilant for expressions of hopelessness or
  self-harm. If detected, warmly offer crisis resources without interrogating.
- If trend is worsening: gently check in on how the user is doing overall.
- If trend is improving: subtly acknowledge progress without referencing data.
```

### Behavioral Calibration by Band

| Band              | Persona Adjustment                                         |
|-------------------|------------------------------------------------------------|
| Minimal (0-4)     | Standard reflective mode. No special calibration.          |
| Mild (5-9)        | Slightly more attentive to mood themes. Normalize struggle.|
| Moderate (10-14)  | More proactive check-ins. If themes escalate, suggest      |
|                   | "talking to someone you trust" or professional support.    |
| Mod. Severe (15-19)| Prioritize validation. Lower threshold for suggesting      |
|                   | professional help. Be watchful for crisis indicators.      |
| Severe (20-27)    | Every session should gently include an opening for the     |
|                   | user to discuss how they're getting support. Surface       |
|                   | professional resources if not already engaged.             |

---

## 5. Recommended Data-Sharing Mechanism (iOS to macOS)

### Options Evaluated

| Mechanism                    | Privacy | Complexity | Reliability | Recommendation |
|------------------------------|---------|------------|-------------|----------------|
| iCloud Private DB (CloudKit) | High    | Medium     | High        | **Primary**    |
| Network Framework + Bonjour  | High    | Medium     | Medium      | **Fallback**   |
| MultipeerConnectivity        | High    | Low        | Low         | Not recommended|
| Shared iCloud container      | High    | Low        | High        | Same as CloudKit|
| BLE                          | High    | High       | Low         | Not recommended|
| HTTP server on iOS           | Medium  | Medium     | Low         | Not recommended|
| Apple Handoff                | High    | Low        | Low         | Not for this   |

### Recommended Architecture: CloudKit Private Database

**Why CloudKit Private DB?**

1. **Data never leaves Apple's encrypted infrastructure** -- E2E encrypted
   in the user's private database, accessible only to apps signed with the
   same developer team ID.
2. **Works without local network** -- syncs over iCloud, no need for
   devices to be on the same WiFi or in proximity.
3. **Same developer account** -- phq-9000 (iOS) and RestReflect (macOS) share
   a developer team, enabling shared CloudKit container.
4. **Minimal data** -- we are transmitting ~100 bytes (severity band, flag,
   date, trend). CloudKit handles this trivially.
5. **Automatic sync** -- CloudKit subscriptions notify RestReflect when new
   assessment data arrives.
6. **No server to maintain** -- fully Apple-managed infrastructure.

**Implementation sketch:**

```swift
// Shared CloudKit container: "iCloud.com.restreflect.shared"
// Record type: "MoodContext"
// Fields:
//   severityBand: String  ("minimal"|"mild"|"moderate"|"moderately_severe"|"severe")
//   item9Flag: Int64      (0 or 1)
//   item9LastPositive: Date?
//   lastAssessment: Date
//   trend: String         ("improving"|"stable"|"worsening"|"insufficient_data")

// phq-9000 writes to private DB after each assessment
// RestReflect subscribes via CKSubscription for push notifications
```

**Fallback: Network Framework + Bonjour (LAN sync)**

For users who disable iCloud or want purely local sync:
- phq-9000 advertises a Bonjour service (`_restreflect._tcp`)
- RestReflect discovers and connects over TLS-PSK on local network
- Transmits the same minimal MoodContext payload
- Requires both devices on same network

### Privacy Principles

- **Data minimization**: Only transmit the severity band and safety flag.
  Never transmit raw answers or individual item scores.
- **On-device processing**: Score calculation happens entirely in phq-9000.
  RestReflect never sees the questionnaire responses.
- **User control**: User must explicitly opt in to sharing mood context with
  RestReflect. Default is OFF.
- **No cloud for clinical data**: Even with CloudKit, we use the PRIVATE
  database (E2E encrypted). Consider offering a "local-only" mode using
  Network Framework for privacy-maximalist users.
- **Deletion**: User can delete all mood context from RestReflect at any time.
  phq-9000 data remains independent.

---

## 6. Referral-to-Human Protocols

### When to Suggest Professional Help

| Trigger                                              | Response Level       |
|------------------------------------------------------|----------------------|
| Item 9 flag + user expresses hopelessness in chat    | Immediate resources  |
| Severity band "severe" for > 2 consecutive assessments| Proactive suggestion |
| User explicitly mentions self-harm thoughts          | Immediate resources  |
| Severity band "moderately severe" + worsening trend  | Gentle suggestion    |
| User asks for help finding a therapist               | Provide guidance     |

### Crisis Resource Language (Warm, Non-Paternalistic)

**DO use:**

> "It sounds like things have been really heavy lately. If you ever want to
> talk to someone who specializes in this, the 988 Suicide & Crisis Lifeline
> is available 24/7 -- you can call or text 988. You can also text HOME to
> 741741 for the Crisis Text Line. You don't have to be in immediate danger
> to reach out."

> "I want you to know that support is available whenever you need it.
> 988 is there for moments like these -- no judgment, just someone to listen."

> "A lot of people find it helpful to talk to a professional when things
> feel this heavy. Would it be useful if I shared some ways to find support?"

**DO NOT use:**

- "You need to call 988 right now." (commanding)
- "I'm worried about you." (the AI is not a person with feelings)
- "Based on your responses, you may be at risk." (references assessment)
- "Are you thinking about hurting yourself?" (the AI must not assess risk)
- "I have to tell you about 988 because of your score." (breaks the wall)
- "You should see a therapist." (prescriptive without invitation)

### Escalation Path

1. **Passive availability**: Crisis resources always accessible in app settings.
2. **Contextual surfacing**: Persona offers resources when conversation themes
   warrant it (hopelessness, worthlessness, trapped feelings).
3. **Repeated surfacing**: If user declines but themes persist across multiple
   sessions, persona can gently re-offer once per session maximum.
4. **Never force**: The persona never blocks conversation, never refuses to
   engage, never makes the user feel surveilled or managed.

### What We Cannot Do (and Should Not Try)

- We cannot perform a suicide risk assessment.
- We cannot contact emergency services on behalf of the user.
- We cannot mandate that the user seek help.
- We should not create a "safety plan" (that is clinical work).
- We should not repeatedly hammer crisis resources -- that becomes noise.

---

## 7. What NOT to Do

### Absolute Prohibitions

1. **Never let the persona diagnose.** "You have moderate depression" is
   unacceptable regardless of what the data says.
2. **Never display PHQ-9 scores in RestReflect.** The macOS app does not
   show scores. That is phq-9000's job.
3. **Never let the persona reference the assessment.** No "based on your
   recent check-in" or "your mood tracker shows."
4. **Never use scores to gate features.** Do not lock the user out of
   features based on severity. Do not change the UI based on scores.
5. **Never store item-level responses on macOS.** Only the derived context
   (band + flag + trend) crosses the boundary.
6. **Never treat improving scores as "cured."** The persona should not
   congratulate or celebrate score improvements.
7. **Never continue therapeutic conversation during active crisis.** If
   the user is expressing imminent self-harm intent in real-time, the
   persona should surface resources and step back, not try to "help."
8. **Never claim to be a therapist or mental health professional.**
9. **Never recommend specific medications or treatment approaches.**
10. **Never share mood context with any third party or analytics.**

### Design Anti-Patterns to Avoid

- **Score gamification**: Never make the user feel like they should try
  to lower their score.
- **Surveillance feeling**: Never let the user feel watched or monitored.
  The persona should feel natural, not data-driven.
- **Paternalistic tone**: "I see you're struggling" when the user hasn't
  said anything negative is a dead giveaway of score-awareness.
- **Over-intervention**: Constantly suggesting therapy when the user just
  wants to journal is counterproductive.
- **Score-dependent personality shift**: The persona should not feel like
  a different entity based on scores. Calibration should be subtle.

---

## 8. Sources

### PHQ-9 Validation and Clinical Use
- [Kroenke, Spitzer, Williams (2001). The PHQ-9: Validity of a Brief Depression Severity Measure. J Gen Intern Med.](https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/)
- [PHQ-9 Score Interpretation: What Each Severity Range Means](https://www.scienceworkshealth.com/post/phq-9-depression-screening-phq-9-scoring-and-how-to-interpret-it-safely)
- [National HIV Curriculum - PHQ-9 Mental Health Screening](https://www.hiv.uw.edu/page/mental-health-screening/phq-9)
- [MDCalc - PHQ-9 Calculator](https://www.mdcalc.com/calc/1725/phq9-patient-health-questionnaire9)
- [APA - PHQ-9 Depression Guideline](https://www.apa.org/depression-guideline/patient-health-questionnaire.pdf)

### Item 9 and Suicide Risk
- [Na et al. (2018). PHQ-9 Item 9 based screening for suicide risk: validation with C-SSRS](https://pubmed.ncbi.nlm.nih.gov/29477096/)
- [Simon et al. (2016). Suicidal Ideation Reported on PHQ9 and Risk of Suicidal Behavior](https://pmc.ncbi.nlm.nih.gov/articles/PMC5412508/)
- [Zero Suicide - PHQ-9 Depression Scale](https://zerosuicide.edc.org/resources/resource-database/patient-health-questionnaire-9-phq-9-depression-scale)

### AI Ethics in Mental Health
- [Exploring the Ethical Challenges of Conversational AI in Mental Health Care: Scoping Review (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11890142/)
- [APA - Ethical Guidance for AI in Professional Practice](https://www.apa.org/topics/artificial-intelligence-machine-learning/ethical-guidance-ai-professional-practice)
- [JMIR - Prompt Engineering Framework for LLM-Based Mental Health Chatbots (2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12594504/)
- [Prompt Engineering for Digital Mental Health: A Short Review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11199861/)

### Crisis Protocols
- [988 Suicide & Crisis Lifeline - Best Practices](https://988lifeline.org/professionals/best-practices/)
- [SAMHSA - 988 Key Messages](https://www.samhsa.gov/mental-health/988/key-messages)
- [Are Mental Health Apps Adequately Equipped to Handle Users in Crisis?](https://pmc.ncbi.nlm.nih.gov/articles/PMC8641126/)
- [Mental Health Apps and Crisis Support: Exploring the Impact of 988](https://psychiatryonline.org/doi/10.1176/appi.ps.20240485)

### AI Companion Safety
- [AI in Mental Health: Wysa vs Youper vs Woebot](https://aicompetence.org/ai-for-mental-health-wysa-vs-youper-vs-woebot/)
- [AI in Mental Health: NICE Guidance on Wysa, Limbic, Woebot](https://www.iatrox.com/blog/ai-mental-health-wysa-limbic-woebot-nice-guidance-uk)
- [Performance of Mental Health Chatbot Agents in Detecting Suicidal Ideation (2025)](https://www.nature.com/articles/s41598-025-17242-4)

### Apple Platform Data Sharing
- [Apple CloudKit Developer Documentation](https://developer.apple.com/icloud/cloudkit/)
- [Apple Network Framework - Device-to-Device Interactions (WWDC22)](https://developer.apple.com/videos/play/wwdc2022/110339/)
- [iOS/macOS Messaging Using Network Framework and Bonjour](https://boramaapps.medium.com/ios-osx-connections-with-network-framework-and-bonjour-service-7fa6130f5789)
- [Apple - Health Privacy White Paper](https://www.apple.com/privacy/docs/Health_Privacy_White_Paper_May_2023.pdf)
