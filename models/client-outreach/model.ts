import {CLIENTS, clientDsl} from './clients';

const CLIENT_LIST = CLIENTS.map((client) => `            ${clientDsl(client)}`).join('\n');

/**
 * The EdgeRules DSL of the client outreach model: a sales team has one working day to reach a list of prospects by a
 * call, an email or an SMS. Each channel takes a different time and convinces a different share of clients. The model
 * decides who gets which channel, so that the expected revenue of the day is the largest.
 *
 * - `campaign` holds the parameters; `channelTerms` gives the time and the lift of a channel.
 * - `wealthTier`, `preferenceFit` and `contactBlocks` are the decision tables: the tier, how well a channel fits the
 *   preference of the client, and the policy rules that block a channel.
 * - `clientRecord` prices the three channel offers of one client and puts the client into a segment: the wealth tier
 *   and the reach (phone and email, phone only, email only). `segmentSummary` aggregates a segment for the solver.
 * - `contactMix` is the optimisation: how many calls, emails and SMS each segment gets within the time of the team.
 *   All clients of a segment can take the same channels, so the counts of the solver can always be given out.
 * - `segmentPicks` gives the counts to the best clients of the segment; `workSchedule` puts the actions on the workers.
 * - `contactPlan` is the `@Service`; `outreachBook` is the workbook.
 */
export const CLIENT_OUTREACH_DSL = `{
    type Client: { id: <string>; name: <string>; wealth: <number>; propensity: <number>; preferredChannel: <string>; hasEmail: <boolean>; phoneConsent: <boolean>; daysSinceContact: <number> }
    type Team: { workers: <number>; dayHours: <number> }
    type Segment: { clients: <number>; callValue: <number>; emailValue: <number>; smsValue: <number> }
    type Candidate: { id: <string>; value: <number> }
    type Action: { clientId: <string>; name: <string>; channel: <string>; minutes: <number>; expectedValue: <number> }
    type Task: { clientId: <string>; name: <string>; channel: <string>; minutes: <number>; expectedValue: <number>; worker: <number>; startMinute: <number>; startsAt: <string> }
    func campaign(): {
        productFee: 250
        wealthRate: 0.002
        smsDailyCap: 40
        dayStart: time("09:00:00")
    }
    ruleset channelTerms(channel: string): {
        hitPolicy: "first-match"
        rules: [
            { when: { channel: "call" }, then: { minutes: 30, lift: 0.25 } }
            { when: { channel: "email" }, then: { minutes: 15, lift: 0.15 } }
            { when: { channel: "sms" }, then: { minutes: 5, lift: 0.08 } }
        ]
        default: { minutes: 0, lift: 0 }
    }
    ruleset wealthTier(wealth: number): {
        hitPolicy: "first-match"
        rules: [
            { when: { wealth: >= 1000000 }, then: { tier: "private" } }
            { when: { wealth: >= 250000 }, then: { tier: "premium" } }
            { when: { wealth: >= 50000 }, then: { tier: "affluent" } }
        ]
        default: { tier: "mass" }
    }
    ruleset preferenceFit(preferred: string, channel: string): {
        hitPolicy: "first-match"
        rules: [
            { when: { preferred: "call", channel: "call" }, then: { factor: 1.5 } }
            { when: { preferred: "email", channel: "email" }, then: { factor: 1.5 } }
            { when: { preferred: "sms", channel: "sms" }, then: { factor: 1.5 } }
            { when: { preferred: "any" }, then: { factor: 1 } }
        ]
        default: { factor: 0.7 }
    }
    ruleset contactBlocks(channel: string, tier: string, phoneConsent: boolean, hasEmail: boolean, daysSinceContact: number): {
        hitPolicy: "collect-matches"
        rules: [
            { when: { daysSinceContact: < 14 }, then: { code: "COOLING_OFF", reason: "Contacted less than 14 days ago" } }
            { when: { channel: "call", phoneConsent: false }, then: { code: "NO_PHONE_CONSENT", reason: "No consent to phone contact" } }
            { when: { channel: "sms", phoneConsent: false }, then: { code: "NO_PHONE_CONSENT", reason: "No consent to phone contact" } }
            { when: { channel: "email", hasEmail: false }, then: { code: "NO_EMAIL", reason: "No email address" } }
            { when: { channel: "sms", tier: "private" }, then: { code: "PRIVATE_NO_SMS", reason: "Private clients are not contacted by SMS" } }
        ]
    }
    func channelOffer(client: Client, tier: string, channel: string): {
        terms: channelTerms(channel)
        fit: preferenceFit(client.preferredChannel, channel).factor
        blocks: contactBlocks(channel, tier, client.phoneConsent, client.hasEmail, client.daysSinceContact)
        allowed: count(blocks) = 0
        probability: round(client.propensity * terms.lift * fit, 4)
        value: if allowed then round((campaign().productFee + client.wealth * campaign().wealthRate) * probability, 2) else 0
    }
    func clientRecord(client: Client): {
        data: client
        tier: wealthTier(client.wealth).tier
        call: channelOffer(client, tier, "call")
        email: channelOffer(client, tier, "email")
        sms: channelOffer(client, tier, "sms")
        contactable: call.allowed or email.allowed or sms.allowed
        reach: if call.allowed and email.allowed then "full" else if call.allowed then "phone" else if email.allowed then "mail" else "none"
        segment: tier + "-" + reach
        blockCodes: distinctValues(flatten([for b in call.blocks return b.code, for b in email.blocks return b.code, for b in sms.blocks return b.code]))
    }
    func averageValue(values: number[]): {
        result: if count(values) = 0 then 0 else round(mean(values), 2)
    }
    func segmentSummary(segmentName: string, records): {
        clients: count(records[segment = segmentName])
        callValue: averageValue(for r in records[segment = segmentName and call.allowed] return r.call.value).result
        emailValue: averageValue(for r in records[segment = segmentName and email.allowed] return r.email.value).result
        smsValue: averageValue(for r in records[segment = segmentName and sms.allowed] return r.sms.value).result
    }
    optimise contactMix(capacityMinutes: number, smsCap: number, callMinutes: number, emailMinutes: number, smsMinutes: number, privateFull: Segment, privatePhone: Segment, privateMail: Segment, premiumFull: Segment, premiumPhone: Segment, premiumMail: Segment, affluentFull: Segment, affluentPhone: Segment, affluentMail: Segment, massFull: Segment, massPhone: Segment, massMail: Segment): {
        variables: {
            privateFullCalls: <number, integer: true, min: 0>
            privateFullEmails: <number, integer: true, min: 0>
            privatePhoneCalls: <number, integer: true, min: 0>
            privateMailEmails: <number, integer: true, min: 0>
            premiumFullCalls: <number, integer: true, min: 0>
            premiumFullEmails: <number, integer: true, min: 0>
            premiumFullSms: <number, integer: true, min: 0>
            premiumPhoneCalls: <number, integer: true, min: 0>
            premiumPhoneSms: <number, integer: true, min: 0>
            premiumMailEmails: <number, integer: true, min: 0>
            affluentFullCalls: <number, integer: true, min: 0>
            affluentFullEmails: <number, integer: true, min: 0>
            affluentFullSms: <number, integer: true, min: 0>
            affluentPhoneCalls: <number, integer: true, min: 0>
            affluentPhoneSms: <number, integer: true, min: 0>
            affluentMailEmails: <number, integer: true, min: 0>
            massFullCalls: <number, integer: true, min: 0>
            massFullEmails: <number, integer: true, min: 0>
            massFullSms: <number, integer: true, min: 0>
            massPhoneCalls: <number, integer: true, min: 0>
            massPhoneSms: <number, integer: true, min: 0>
            massMailEmails: <number, integer: true, min: 0>
        }
        maximise: privateFull.callValue * privateFullCalls + privateFull.emailValue * privateFullEmails + privatePhone.callValue * privatePhoneCalls + privateMail.emailValue * privateMailEmails + premiumFull.callValue * premiumFullCalls + premiumFull.emailValue * premiumFullEmails + premiumFull.smsValue * premiumFullSms + premiumPhone.callValue * premiumPhoneCalls + premiumPhone.smsValue * premiumPhoneSms + premiumMail.emailValue * premiumMailEmails + affluentFull.callValue * affluentFullCalls + affluentFull.emailValue * affluentFullEmails + affluentFull.smsValue * affluentFullSms + affluentPhone.callValue * affluentPhoneCalls + affluentPhone.smsValue * affluentPhoneSms + affluentMail.emailValue * affluentMailEmails + massFull.callValue * massFullCalls + massFull.emailValue * massFullEmails + massFull.smsValue * massFullSms + massPhone.callValue * massPhoneCalls + massPhone.smsValue * massPhoneSms + massMail.emailValue * massMailEmails
        constraints: {
            teamTime: callMinutes * privateFullCalls + emailMinutes * privateFullEmails + callMinutes * privatePhoneCalls + emailMinutes * privateMailEmails + callMinutes * premiumFullCalls + emailMinutes * premiumFullEmails + smsMinutes * premiumFullSms + callMinutes * premiumPhoneCalls + smsMinutes * premiumPhoneSms + emailMinutes * premiumMailEmails + callMinutes * affluentFullCalls + emailMinutes * affluentFullEmails + smsMinutes * affluentFullSms + callMinutes * affluentPhoneCalls + smsMinutes * affluentPhoneSms + emailMinutes * affluentMailEmails + callMinutes * massFullCalls + emailMinutes * massFullEmails + smsMinutes * massFullSms + callMinutes * massPhoneCalls + smsMinutes * massPhoneSms + emailMinutes * massMailEmails <= capacityMinutes
            smsGateway: premiumFullSms + premiumPhoneSms + affluentFullSms + affluentPhoneSms + massFullSms + massPhoneSms <= smsCap
            privateFullOnce: privateFullCalls + privateFullEmails <= privateFull.clients
            privatePhoneOnce: privatePhoneCalls <= privatePhone.clients
            privateMailOnce: privateMailEmails <= privateMail.clients
            premiumFullOnce: premiumFullCalls + premiumFullEmails + premiumFullSms <= premiumFull.clients
            premiumPhoneOnce: premiumPhoneCalls + premiumPhoneSms <= premiumPhone.clients
            premiumMailOnce: premiumMailEmails <= premiumMail.clients
            affluentFullOnce: affluentFullCalls + affluentFullEmails + affluentFullSms <= affluentFull.clients
            affluentPhoneOnce: affluentPhoneCalls + affluentPhoneSms <= affluentPhone.clients
            affluentMailOnce: affluentMailEmails <= affluentMail.clients
            massFullOnce: massFullCalls + massFullEmails + massFullSms <= massFull.clients
            massPhoneOnce: massPhoneCalls + massPhoneSms <= massPhone.clients
            massMailOnce: massMailEmails <= massMail.clients
        }
        timeLimit: 5000
    }
    func topIds(candidates: Candidate[], n: number): {
        ranked: for c in candidates return { id: c.id, rank: count(candidates[value > c.value]) + count(candidates[value = c.value and id < c.id]) + 1 }
        ids: for r in ranked[rank <= n] return r.id
    }
    func segmentPicks(segmentName: string, records, calls: number, emails: number, sms: number): {
        callIds: topIds(for r in records[segment = segmentName and call.allowed] return { id: r.data.id, value: r.call.value }, calls).ids
        emailIds: topIds(for r in records[segment = segmentName and email.allowed and not(contains(callIds, data.id))] return { id: r.data.id, value: r.email.value }, emails).ids
        smsIds: topIds(for r in records[segment = segmentName and sms.allowed and not(contains(callIds, data.id)) and not(contains(emailIds, data.id))] return { id: r.data.id, value: r.sms.value }, sms).ids
    }
    func clientAction(record, callIds, emailIds, smsIds): {
        channel: if contains(callIds, record.data.id) then "call" else if contains(emailIds, record.data.id) then "email" else if contains(smsIds, record.data.id) then "sms" else "none"
        offer: if channel = "call" then record.call else if channel = "email" then record.email else record.sms
        minutes: if channel = "none" then 0 else offer.terms.minutes
        expectedValue: if channel = "none" then 0 else offer.value
        reason: if channel != "none" then "Selected: " + toString(round(offer.probability * 100, 2)) + "% chance to buy" else if not(record.contactable) then "Not contactable: " + join(record.blockCodes, ", ") else "Not selected: the day is full"
    }
    func clockTime(minutesIntoDay: number): {
        at: campaign().dayStart + duration("PT" + toString(minutesIntoDay) + "M")
        text: padStart(toString(at.hour), 2, "0") + ":" + padStart(toString(at.minute), 2, "0")
    }
    loop workSchedule(actions: Action[], workers: number): {
        over: actions
        state: { slot: 0, loads: for w in 1..workers return 0, tasks: <Task[], []> }
        do: {
            slot: find(state.loads, min(state.loads))
            loads: for i in 0..(workers - 1) return if i = slot then state.loads[i] + item.minutes else state.loads[i]
            tasks: append(state.tasks, { clientId: item.clientId, name: item.name, channel: item.channel, minutes: item.minutes, expectedValue: item.expectedValue, worker: slot + 1, startMinute: state.loads[slot], startsAt: clockTime(state.loads[slot]).text })
        }
        return: state.tasks
    }
    func inWorkOrder(actions: Action[]): {
        ranked: for a in actions return { action: a, seq: count(actions[minutes > a.minutes]) + count(actions[minutes = a.minutes and expectedValue > a.expectedValue]) + count(actions[minutes = a.minutes and expectedValue = a.expectedValue and clientId < a.clientId]) + 1 }
        result: for k in 1..count(actions) return ranked[seq = k][0].action
    }
    func channelTotals(plan, channelName: string): {
        channel: channelName
        clients: count(plan[action = channelName])
        minutes: sum(for p in plan[action = channelName] return p.minutes)
        expectedValue: round(sum(for p in plan[action = channelName] return p.expectedValue), 2)
    }
    func tierTotals(plan, tierName: string): {
        tier: tierName
        calls: count(plan[tier = tierName and action = "call"])
        emails: count(plan[tier = tierName and action = "email"])
        sms: count(plan[tier = tierName and action = "sms"])
        none: count(plan[tier = tierName and action = "none"])
    }
    @Service
    func contactPlan(clients: Client[], team: Team): {
        records: for client in clients return clientRecord(client)
        capacityMinutes: team.workers * team.dayHours * 60
        segments: {
            privateFull: segmentSummary("private-full", records)
            privatePhone: segmentSummary("private-phone", records)
            privateMail: segmentSummary("private-mail", records)
            premiumFull: segmentSummary("premium-full", records)
            premiumPhone: segmentSummary("premium-phone", records)
            premiumMail: segmentSummary("premium-mail", records)
            affluentFull: segmentSummary("affluent-full", records)
            affluentPhone: segmentSummary("affluent-phone", records)
            affluentMail: segmentSummary("affluent-mail", records)
            massFull: segmentSummary("mass-full", records)
            massPhone: segmentSummary("mass-phone", records)
            massMail: segmentSummary("mass-mail", records)
        }
        mix: contactMix(capacityMinutes: capacityMinutes, smsCap: campaign().smsDailyCap, callMinutes: channelTerms("call").minutes, emailMinutes: channelTerms("email").minutes, smsMinutes: channelTerms("sms").minutes, privateFull: segments.privateFull, privatePhone: segments.privatePhone, privateMail: segments.privateMail, premiumFull: segments.premiumFull, premiumPhone: segments.premiumPhone, premiumMail: segments.premiumMail, affluentFull: segments.affluentFull, affluentPhone: segments.affluentPhone, affluentMail: segments.affluentMail, massFull: segments.massFull, massPhone: segments.massPhone, massMail: segments.massMail)
        picks: [
            segmentPicks("private-full", records, mix.privateFullCalls, mix.privateFullEmails, 0)
            segmentPicks("private-phone", records, mix.privatePhoneCalls, 0, 0)
            segmentPicks("private-mail", records, 0, mix.privateMailEmails, 0)
            segmentPicks("premium-full", records, mix.premiumFullCalls, mix.premiumFullEmails, mix.premiumFullSms)
            segmentPicks("premium-phone", records, mix.premiumPhoneCalls, 0, mix.premiumPhoneSms)
            segmentPicks("premium-mail", records, 0, mix.premiumMailEmails, 0)
            segmentPicks("affluent-full", records, mix.affluentFullCalls, mix.affluentFullEmails, mix.affluentFullSms)
            segmentPicks("affluent-phone", records, mix.affluentPhoneCalls, 0, mix.affluentPhoneSms)
            segmentPicks("affluent-mail", records, 0, mix.affluentMailEmails, 0)
            segmentPicks("mass-full", records, mix.massFullCalls, mix.massFullEmails, mix.massFullSms)
            segmentPicks("mass-phone", records, mix.massPhoneCalls, 0, mix.massPhoneSms)
            segmentPicks("mass-mail", records, 0, mix.massMailEmails, 0)
        ]
        callIds: flatten(for p in picks return p.callIds)
        emailIds: flatten(for p in picks return p.emailIds)
        smsIds: flatten(for p in picks return p.smsIds)
        actions: for r in records return clientAction(r, callIds, emailIds, smsIds)
        contacted: for i in 0..(count(records) - 1) return { clientId: records[i].data.id, name: records[i].data.name, channel: actions[i].channel, minutes: actions[i].minutes, expectedValue: actions[i].expectedValue }
        schedule: workSchedule(actions: inWorkOrder(contacted[channel != "none"]).result, workers: team.workers)
        plan: for i in 0..(count(records) - 1) return {
            clientId: records[i].data.id
            name: records[i].data.name
            tier: records[i].tier
            action: actions[i].channel
            worker: if actions[i].channel = "none" then 0 else schedule[clientId = records[i].data.id][0].worker
            startsAt: if actions[i].channel = "none" then "" else schedule[clientId = records[i].data.id][0].startsAt
            minutes: actions[i].minutes
            expectedValue: actions[i].expectedValue
            reason: actions[i].reason
        }
        byChannel: [channelTotals(plan, "call"), channelTotals(plan, "email"), channelTotals(plan, "sms")]
        byTier: [tierTotals(plan, "private"), tierTotals(plan, "premium"), tierTotals(plan, "affluent"), tierTotals(plan, "mass")]
        summary: {
            status: mix.status
            contacted: count(plan[action != "none"])
            notContacted: count(plan[action = "none"])
            minutesUsed: sum(for p in plan return p.minutes)
            minutesAvailable: capacityMinutes
            expectedRevenue: round(sum(for p in plan return p.expectedValue), 2)
            plannedRevenue: round(mix.objective, 2)
        }
    }
    @Workbook
    outreachBook: {
        @InputNode(name: "Team")
        team: { workers: 2; dayHours: 7 }
        @InputNode(name: "Clients")
        clients: [
${CLIENT_LIST}
        ]
        @FunctionNode(name: "Contact plan")
        outreach: contactPlan(clients: clients, team: team)
    }
}`;
