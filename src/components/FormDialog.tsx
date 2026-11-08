import { Button, Intent } from "@blueprintjs/core";
import React, { useLayoutEffect, useRef, useState } from "react";

type Props = {
  title: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  initialFocus: React.RefObject<HTMLInputElement>;
  pending: boolean;
  canSubmit: boolean;
  submitLabel: string;
  closeLabel: string;
  status: string;
  secondaryAction?: React.ReactNode;
  children: (popupContainer: HTMLElement | undefined) => React.ReactNode;
};

const FormDialog = ({
  title,
  onClose,
  onSubmit,
  initialFocus,
  pending,
  canSubmit,
  submitLabel,
  closeLabel,
  status,
  secondaryAction,
  children,
}: Props): React.ReactElement => {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const pointerOnBackdrop = useRef(false);

  useLayoutEffect(() => {
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    initialFocus.current?.focus();
    return () => {
      dialog.close();
      if (
        trigger instanceof HTMLElement &&
        trigger.isConnected &&
        document.activeElement === document.body
      ) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [dialog, initialFocus]);

  useLayoutEffect(() => {
    if (!dialog) return;
    const cancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", cancel);
    return () => dialog.removeEventListener("cancel", cancel);
  }, [dialog, onClose]);

  return (
    <dialog
      ref={setDialog}
      className="google-calendar-form-dialog"
      aria-modal="true"
      aria-labelledby="google-calendar-form-title"
      onPointerDown={(event) => {
        pointerOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          !pending &&
          pointerOnBackdrop.current &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
        pointerOnBackdrop.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
        if (event.key !== "Tab" || event.defaultPrevented) return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (node) =>
            node.tabIndex >= 0 &&
            !node.matches(":disabled") &&
            node.getClientRects().length,
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="google-calendar-form-frame">
        <header>
          <h2 id="google-calendar-form-title">{title}</h2>
          <Button
            type="button"
            icon="cross"
            minimal
            aria-label={pending ? "Close while saving" : "Close form"}
            onClick={onClose}
          />
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending && canSubmit) onSubmit(event);
          }}
        >
          <div className="google-calendar-form-body">
            {children(dialog ?? undefined)}
            <p
              className={
                pending
                  ? "google-calendar-form-announcement"
                  : "google-calendar-form-status"
              }
              role="status"
            >
              {status}
            </p>
          </div>
          <footer>
            {secondaryAction}
            <Button type="button" text={closeLabel} onClick={onClose} />
            <Button
              type="submit"
              className="google-calendar-save-button"
              intent={Intent.PRIMARY}
              loading={pending}
              disabled={pending || !canSubmit}
              text={submitLabel}
              aria-label={submitLabel}
            />
          </footer>
        </form>
      </div>
    </dialog>
  );
};

export default FormDialog;
