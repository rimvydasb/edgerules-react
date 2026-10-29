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
 * - `clientRecord` prices the three channel offers of one client.
 * - `contactMix` is the optimisation: one 0/1 decision variable per client and channel (`over: clients`), at most one
 *   action per client, no blocked channel, within the time of the team and the SMS limit.
 * - `clientAction` reads the decision of the solver for one client; `workSchedule` puts the actions on the workers.
 * - `contactPlan` is the `@Service`; `outreachBook` is the workbook.
 */
export const CLIENT_OUTREACH_DSL = `{
    type Client: { id: <string>; name: <string>; wealth: <number>; propensity: <number>; preferredChannel: <string>; hasEmail: <boolean>; phoneConsent: <boolean>; daysSinceContact: <number> }
    type Team: { workers: <number>; dayHours: <number> }
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
        blockCodes: distinctValues(flatten([for b in call.blocks return b.code, for b in email.blocks return b.code, for b in sms.blocks return b.code]))
    }
    func allowedFlag(offer): {
        result: if offer.allowed then 1 else 0
    }
    optimise contactMix(clients: Client[], callOk: number[], emailOk: number[], smsOk: number[], callValue: number[], emailValue: number[], smsValue: number[], callMinutes: number, emailMinutes: number, smsMinutes: number, capacityMinutes: number, smsCap: number): {
        variables: {
            call: <number[], integer: true, min: 0, max: 1, over: clients>
            email: <number[], integer: true, min: 0, max: 1, over: clients>
            sms: <number[], integer: true, min: 0, max: 1, over: clients>
        }
        maximise: sum(for i in 0..(count(clients) - 1) return callValue[i] * call[i] + emailValue[i] * email[i] + smsValue[i] * sms[i])
        constraints: {
            oneAction: for i in 0..(count(clients) - 1) return call[i] + email[i] + sms[i] <= 1
            callAllowed: for i in 0..(count(clients) - 1) return call[i] <= callOk[i]
            emailAllowed: for i in 0..(count(clients) - 1) return email[i] <= emailOk[i]
            smsAllowed: for i in 0..(count(clients) - 1) return sms[i] <= smsOk[i]
            teamTime: sum(for c in call return callMinutes * c) + sum(for e in email return emailMinutes * e) + sum(for s in sms return smsMinutes * s) <= capacityMinutes
            smsGateway: sum(for s in sms return s) <= smsCap
        }
        timeLimit: 5000
    }
    func clientAction(record, call: number, email: number, sms: number): {
        channel: if call > 0.5 then "call" else if email > 0.5 then "email" else if sms > 0.5 then "sms" else "none"
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
        mix: contactMix(clients: clients, callOk: for r in records return allowedFlag(r.call).result, emailOk: for r in records return allowedFlag(r.email).result, smsOk: for r in records return allowedFlag(r.sms).result, callValue: for r in records return r.call.value, emailValue: for r in records return r.email.value, smsValue: for r in records return r.sms.value, callMinutes: channelTerms("call").minutes, emailMinutes: channelTerms("email").minutes, smsMinutes: channelTerms("sms").minutes, capacityMinutes: capacityMinutes, smsCap: campaign().smsDailyCap)
        actions: for i in 0..(count(records) - 1) return clientAction(records[i], mix.call[i], mix.email[i], mix.sms[i])
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
