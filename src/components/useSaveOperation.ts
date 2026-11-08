import { useLayoutEffect, useRef, useState } from "react";
import type { SaveOutcome } from "../services/saveCalendarEvent";

export type SaveState =
  | { kind: "ready" }
  | { kind: "saving"; label: string }
  | SaveOutcome;

type Work = (signal: AbortSignal) => Promise<SaveOutcome>;

type SaveOperation<Draft> = {
  state: SaveState;
  start: (
    draft: Draft,
    save: (draft: Draft, signal: AbortSignal) => Promise<SaveOutcome>,
  ) => Promise<SaveOutcome | undefined>;
  resume: (label: string) => Promise<SaveOutcome | undefined>;
  reset: () => void;
};

export const useSaveOperation = <Draft>(): SaveOperation<Draft> => {
  const [state, render] = useState<SaveState>({ kind: "ready" });
  const current = useRef(state);
  const pending = useRef<AbortController>();

  useLayoutEffect(() => () => pending.current?.abort(), []);

  const setState = (next: SaveState): void => {
    current.current = next;
    render(next);
  };

  const run = async (
    work: Work,
    label: string,
  ): Promise<SaveOutcome | undefined> => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setState({ kind: "saving", label });
    let result: SaveOutcome;
    try {
      result = await work(controller.signal);
    } catch {
      result = {
        kind: "unknown",
        allowCheckedDiscard: true,
        message:
          "The save could not be confirmed. Check Google Calendar for this event.",
      };
    }
    pending.current = undefined;
    if (controller.signal.aborted) return;
    setState(result);
    return result;
  };

  return {
    state,
    start: async (draft, save) => {
      const previous = current.current;
      if (
        previous.kind === "ready" ||
        (previous.kind === "failure" && previous.retrySafe)
      ) {
        return run((signal) => save(draft, signal), "Saving…");
      }
    },
    resume: async (label) => {
      const previous = current.current;
      if (
        (previous.kind === "unknown" || previous.kind === "partial") &&
        previous.recover
      ) {
        return run(previous.recover, label);
      }
    },
    reset: () => {
      if (!pending.current) setState({ kind: "ready" });
    },
  };
};
