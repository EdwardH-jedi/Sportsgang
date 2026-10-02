/**
 * Pure form model for the v2 "host a run / round" composer.
 *
 * Mirrors the server rules in apps/api/app/services/events.py so most
 * mistakes are caught before a request; the server stays authoritative and
 * its 422 detail is shown verbatim when it disagrees.
 * Times are Sydney wall time, converted with sydneyWallTimeToUtc.
 */

import type {
  CreateEventRequest,
  FocusSport,
  GolfSessionDetails,
  RunSessionDetails,
} from '@protin/shared-types';

import { parseHandicap, parsePaceRange } from '../../lib/sportPreferences';
import { addDaysToDateString, sydneyDateString, sydneyWallTimeToUtc } from '../../lib/sydneyTime';

export interface RunFormState {
  distanceKm: string;
  paceMode: RunSessionDetails['paceMode'];
  paceFastest: string;
  paceSlowest: string;
  groupStyle: RunSessionDetails['groupStyle'];
  beginnerFriendly: boolean;
  walkBreaksOk: boolean;
}

export interface GolfFormState {
  holes: GolfSessionDetails['holes'];
  teeTimeStatus: GolfSessionDetails['teeTimeStatus'];
  costDollars: string;
  handicapLow: string;
  handicapHigh: string;
  beginnersWelcome: boolean;
}

export interface SessionFormState {
  title: string;
  /** Sydney calendar date "YYYY-MM-DD". */
  date: string;
  /** Sydney wall time "HH:MM". */
  time: string;
  locationText: string;
  capacity: number;
  description: string;
  run: RunFormState;
  golf: GolfFormState;
}

export type FormField =
  | 'title'
  | 'when'
  | 'location'
  | 'capacity'
  | 'distance'
  | 'pace'
  | 'cost'
  | 'handicap'
  | 'description';

export type FormErrors = Partial<Record<FormField, string>>;

export const CAPACITY_LIMITS: Record<FocusSport, { min: number; max: number; default: number }> = {
  running: { min: 2, max: 50, default: 8 },
  golf: { min: 2, max: 4, default: 4 },
};

export function defaultSessionForm(sport: FocusSport, nowMs: number = Date.now()): SessionFormState {
  return {
    title: '',
    date: addDaysToDateString(sydneyDateString(nowMs), 1),
    time: sport === 'golf' ? '08:00' : '06:30',
    locationText: '',
    capacity: CAPACITY_LIMITS[sport].default,
    description: '',
    run: {
      distanceKm: '5',
      paceMode: 'social',
      paceFastest: '',
      paceSlowest: '',
      groupStyle: 'stay_together',
      beginnerFriendly: false,
      walkBreaksOk: false,
    },
    golf: {
      holes: 18,
      teeTimeStatus: 'planning',
      costDollars: '',
      handicapLow: '',
      handicapHigh: '',
      beginnersWelcome: false,
    },
  };
}

function parseDistance(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return null;
  const v = Number(t);
  return v > 0 && v <= 100 ? v : null;
}

function parseDollarsToCents(text: string): number | null {
  const t = text.trim().replace(/^\$/, '');
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents <= 1_000_000 ? cents : null;
}

export type BuildResult = { ok: true; body: CreateEventRequest } | { ok: false; errors: FormErrors };

export function buildCreateEventRequest(
  sport: FocusSport,
  form: SessionFormState,
  nowMs: number = Date.now()
): BuildResult {
  const errors: FormErrors = {};
  const title = form.title.trim();
  const locationText = form.locationText.trim();
  const description = form.description.trim();

  if (!title) errors.title = sport === 'golf' ? 'Give your round a name.' : 'Give your run a name.';
  else if (title.length > 120) errors.title = 'Keep the name under 120 characters.';

  if (!locationText) {
    errors.location = sport === 'golf' ? 'Add the course.' : 'Add a meeting point.';
  } else if (locationText.length > 200) errors.location = 'Keep the location under 200 characters.';

  if (description.length > 1000) errors.description = 'Keep notes under 1000 characters.';

  let startsAt: string | null = null;
  const when = sydneyWallTimeToUtc(form.date, form.time);
  if (!when.ok) errors.when = when.error;
  else if (Date.parse(when.iso) <= nowMs) errors.when = 'Pick a time in the future (Sydney time).';
  else startsAt = when.iso;

  const limits = CAPACITY_LIMITS[sport];
  if (!Number.isInteger(form.capacity) || form.capacity < limits.min || form.capacity > limits.max) {
    errors.capacity =
      sport === 'golf'
        ? 'A golf group is 2 to 4 players, including you.'
        : 'A group run is 2 to 50 runners, including you.';
  }

  let runDetails: RunSessionDetails | undefined;
  let golfDetails: GolfSessionDetails | undefined;

  if (sport === 'running') {
    const distance = parseDistance(form.run.distanceKm);
    if (distance === null) errors.distance = 'Distance in km, e.g. 5 or 10.5 (up to 100).';
    let paceMin: number | null = null;
    let paceMax: number | null = null;
    if (form.run.paceMode === 'target_pace') {
      const range = parsePaceRange(form.run.paceFastest, form.run.paceSlowest);
      if (!range.ok) errors.pace = range.error;
      else {
        paceMin = range.min;
        paceMax = range.max;
      }
    }
    if (distance !== null) {
      runDetails = {
        distanceKm: distance,
        paceMode: form.run.paceMode,
        paceMinSecPerKm: paceMin,
        paceMaxSecPerKm: paceMax,
        groupStyle: form.run.groupStyle,
        beginnerFriendly: form.run.beginnerFriendly,
        walkBreaksOk: form.run.walkBreaksOk,
      };
    }
  } else {
    let cost: number | null = null;
    if (form.golf.costDollars.trim()) {
      cost = parseDollarsToCents(form.golf.costDollars);
      if (cost === null) errors.cost = 'Use dollars, e.g. 35 or 42.50.';
    }
    let low: number | null = null;
    let high: number | null = null;
    const lowText = form.golf.handicapLow.trim();
    const highText = form.golf.handicapHigh.trim();
    if (lowText || highText) {
      if (!lowText || !highText) errors.handicap = 'Give both ends of the handicap guide, or leave both empty.';
      else {
        const a = parseHandicap(lowText);
        const b = parseHandicap(highText);
        if (!a.ok) errors.handicap = a.error;
        else if (!b.ok) errors.handicap = b.error;
        // Signed tenths: lower value = better golfer (+2.1 is -21).
        else if (a.value > b.value) errors.handicap = 'Put the better (lower) handicap first.';
        else {
          low = a.value;
          high = b.value;
        }
      }
    }
    golfDetails = {
      holes: form.golf.holes,
      teeTimeStatus: form.golf.teeTimeStatus,
      estimatedCostCents: cost,
      handicapMinTenths: low,
      handicapMaxTenths: high,
      beginnersWelcome: form.golf.beginnersWelcome,
    };
  }

  if (Object.keys(errors).length > 0 || startsAt === null) return { ok: false, errors };

  return {
    ok: true,
    body: {
      title,
      sport,
      mode: 'casual',
      startsAt,
      locationText,
      capacity: form.capacity,
      description: description || null,
      visibility: 'public',
      ...(runDetails ? { runDetails } : {}),
      ...(golfDetails ? { golfDetails } : {}),
    },
  };
}
