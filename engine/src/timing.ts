// Time limits shared by the online server and the in-browser game against the computer,
// so the two can't drift apart.

/**
 * How long the other player has to react to each action. Every action gets the same pause,
 * whether or not they hold Intercept or Reversal, so the pause gives nothing away about their hand.
 */
export const REACTION_WINDOW_MS = 4000

/** Extra time to Intercept or let it happen, after backing out of choosing a Reversal target. */
export const REVERSAL_CANCEL_MS = 4000

/** How long a player has to choose a Bodyguard. */
export const BODYGUARD_MS = 15000
