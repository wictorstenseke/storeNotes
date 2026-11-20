export const MOTION = { duration: 180, easing: 'ease-out' };

// How long a line stays where it was tapped after being checked or unchecked.
// Moving it at once would slide its neighbours under the finger, and the next
// tap would land on the wrong line. Each new tap restarts the wait.
export const SETTLE_MS = 1000;
