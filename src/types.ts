export type AreaId = 'E' | 'S' | 'C' | 'W';

/** How a visitor gets into a session: advance application, same-day numbered ticket, or first come. */
export type Needs = 'apply' | 'ticket' | 'first';

export type ApplyMethod = 'lottery' | 'first' | 'tbd';

export interface Area {
  id: AreaId;
  name: string;
}

/** A room that is a column of the timetable grid. */
export interface Place {
  id: string;
  area: AreaId;
  /** building code on the official map, e.g. "E-2" */
  code: string;
  building: string;
  room: string;
}

export interface ApplyInfo {
  method: ApplyMethod;
  /** the organiser has not published the application details yet */
  pending: boolean;
  /** the part of the event that needs an application (absent = the whole event) */
  target?: string;
  start?: string; // ISO 8601 with offset
  end?: string;
  url?: string;
  note?: string;
  /** how and when the result is announced (summary) */
  result?: string;
  resultBy?: string; // ISO 8601
}

/** When numbered tickets start being handed out (a marker on the timetable). */
export interface TicketSlot {
  time: string; // HH:MM
  note: string;
  /** Place.id of the grid column the marker is drawn in */
  place: string;
}

export interface TicketInfo {
  time: string;
  place: string;
  slots?: TicketSlot[];
  target?: string;
  count?: string;
}

export interface EventInfo {
  /** official event number ("01".."57"); the key for a visitor's application status */
  no: string;
  title: string;
  areas: AreaId[];
  categories: string[];
  placeText: string;
  timeText: string;
  summary: string;
  participation: string[];
  note?: string;
  target?: string;
  capacity?: string;
  duration?: string;
  firstCome?: string;
  status?: string;
  apply?: ApplyInfo;
  ticket?: TicketInfo;
}

/**
 * One selectable unit. Either a fixed-time slot ("14/2": event 14, 2nd run) shown on the grid,
 * or the drop-in part of an event ("12") that can be visited any time during its hours.
 */
export interface Session {
  id: string;
  event: string;
  open: boolean;
  /** Place.id (fixed-time sessions) */
  place?: string;
  /** area (drop-in sessions) */
  area?: AreaId;
  start: string; // HH:MM
  end: string;
  /** default length in minutes when the visitor pins a drop-in session to a time */
  visit?: number;
  /** opening hours when there is a break, e.g. [["10:00","12:00"],["13:00","15:30"]] */
  hours?: [string, string][];
  label?: string;
  sub?: string;
  endEstimated?: boolean;
  needs?: Needs;
}

/** One day's changes found on the official site (data/updates.json, newest first). */
export interface UpdateItem {
  /** event number the change is about; omitted for notes that cover several events */
  no?: string;
  text: string;
}
export interface UpdateEntry {
  date: string; // YYYY-MM-DD
  items: UpdateItem[];
}

export interface Program {
  event: {
    name: string;
    date: string;
    open: string;
    close: string;
    lastEntry: string;
    site: string;
    listUrl: string;
    generatedFrom: string[];
    generatedAt: string;
  };
  areas: Area[];
  places: Place[];
  events: EventInfo[];
  sessions: Session[];
}

/** A visitor's own record of an advance application. Absent = not applied. */
export type MyApply = 'applied' | 'won' | 'lost';
