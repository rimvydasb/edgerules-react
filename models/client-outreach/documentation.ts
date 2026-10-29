import type {DocumentationDocument} from '../../src/components/project-session';

/** `documentation.json` of the client outreach project: one description per model path. */
export const CLIENT_OUTREACH_DOCUMENTATION: DocumentationDocument = {
    schemaVersion: 1,
    byPath: {
        '*': 'Plans one working day of sales outreach: prices a call, an email and an SMS for every prospect, respects the contact policy, and lets the MILP solver pick the channels with the largest expected revenue',
        Client: 'One prospect: wealth, propensity to buy, preferred channel, consent and the days since the last contact',
        Team: 'The sales team of the day: the number of workers and the working hours of each worker',
        Action: 'The channel chosen for one client, its time and its expected value',
        Task: 'An action on the schedule: the worker and the start of the action',
        campaign: 'The parameters of the campaign: the product revenue, the SMS gateway limit and the start of the day',
        channelTerms: 'The time a channel takes and the lift: the share of clients it convinces to buy',
        wealthTier: 'Puts a client into a wealth tier: private, premium, affluent or mass',
        preferenceFit:
            'How well a channel fits the preferred channel of the client: the preferred one convinces more, another less',
        contactBlocks: 'The contact policy: every rule that forbids the channel for this client, with the reason',
        channelOffer:
            'One channel for one client: the probability to buy, and the expected revenue when the policy allows it',
        clientRecord:
            'The client data, the tier, the offers of the three channels and the codes of every rule that blocks a channel',
        contactMix:
            'The optimisation: a 0/1 decision per client and channel, at most one action per client and no blocked channel, for the largest expected revenue within the time of the team and the SMS limit',
        allowedFlag: 'The offer as a bound for the solver: 1 when the policy allows the channel, else 0',
        clientAction: 'The channel the solver chose for a client, its time, its expected value and the reason',
        clockTime: 'The clock time a number of minutes after the start of the day, as HH:MM',
        workSchedule:
            'Puts the actions on the workers, longest first, each on the worker who is free first. The channel times divide each other and the working day, so the plan always fits',
        inWorkOrder: 'Orders the actions: longest first, then the largest expected value first',
        channelTotals: 'The clients, the minutes and the expected revenue of one channel',
        tierTotals: 'The calls, emails, SMS and not contacted clients of one wealth tier',
        contactPlan:
            'Plans the outreach of one day: prices every channel for every client, lets the solver choose the channel of every client, and returns the action, the worker and the start time for every client',
        outreachBook:
            'One working day for two workers and 100 prospects: the channel, the worker and the start time for every client, with the totals by channel and wealth tier',
        'outreachBook.team': 'Two workers, seven hours each',
        'outreachBook.clients': 'The 100 prospects of the day',
        'outreachBook.outreach': 'The contact plan: what to do with every client, and the totals by channel and tier',
    },
};
