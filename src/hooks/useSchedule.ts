import { useCallback, useEffect, useReducer } from 'react';
import type { MyApply } from '../types';
import { EMPTY, loadSchedule, saveSchedule, type ScheduleState } from '../lib/storage';

type Action =
  | { type: 'toggle'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'time'; id: string; time: string | null }
  | { type: 'apply'; no: string; status: MyApply | null }
  | { type: 'replace'; state: ScheduleState }
  | { type: 'clear' };

function without<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _drop, ...rest } = rec;
  return rest;
}

export function reducer(state: ScheduleState, action: Action): ScheduleState {
  switch (action.type) {
    case 'toggle':
      return state.selected.includes(action.id)
        ? reducer(state, { type: 'remove', id: action.id })
        : { ...state, selected: [...state.selected, action.id] };
    case 'remove':
      return { ...state, selected: state.selected.filter((x) => x !== action.id), times: without(state.times, action.id) };
    case 'time':
      return { ...state, times: action.time ? { ...state.times, [action.id]: action.time } : without(state.times, action.id) };
    case 'apply':
      return { ...state, apply: action.status ? { ...state.apply, [action.no]: action.status } : without(state.apply, action.no) };
    case 'replace':
      return action.state;
    case 'clear':
      return EMPTY;
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The visitor's record (selected sessions, chosen times, application status),
 * persisted to localStorage under tksc-openday2026.schedule.v1 .
 *
 * IDs that are not in the current program are KEPT in storage (only hidden by the UI):
 * a data correction that renames or temporarily removes a session must never erase a
 * visitor's record. `isKnown` only guards new additions from the UI.
 */
export function useSchedule(isKnown: (id: string) => boolean = () => true) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadSchedule(storage()));

  useEffect(() => {
    saveSchedule(storage(), state);
  }, [state]);

  const toggle = useCallback(
    (id: string) => {
      if (isKnown(id)) dispatch({ type: 'toggle', id });
    },
    [isKnown],
  );
  const remove = useCallback((id: string) => dispatch({ type: 'remove', id }), []);
  const setTime = useCallback((id: string, time: string | null) => dispatch({ type: 'time', id, time }), []);
  const setApply = useCallback((no: string, status: MyApply | null) => dispatch({ type: 'apply', no, status }), []);
  const replace = useCallback((s: ScheduleState) => dispatch({ type: 'replace', state: s }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return { state, toggle, remove, setTime, setApply, replace, clear };
}
