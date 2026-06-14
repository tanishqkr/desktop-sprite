// Hand-rolled finite state machine for the pet.
// Three states, simple transitions — no dependency needed for this.
//
//   idle  -> walk  (dragStart) | react (click)
//   walk  -> idle  (dragEnd)
//   react -> idle  (animationComplete)

export const STATES = {
  IDLE: "idle",
  WALK: "walk",
  REACT: "react",
};

// transitions[currentState][event] = nextState
const transitions = {
  idle: {
    dragStart: STATES.WALK,
    click: STATES.REACT,
  },
  walk: {
    dragEnd: STATES.IDLE,
  },
  react: {
    animationComplete: STATES.IDLE,
  },
};

/** Pure transition function. Unknown events leave the state unchanged. */
export function nextState(current, event) {
  const fromState = transitions[current];
  if (fromState && fromState[event]) {
    return fromState[event];
  }
  return current;
}

/** Reducer wrapper for use with React's useReducer. */
export function petReducer(state, event) {
  return nextState(state, event);
}
