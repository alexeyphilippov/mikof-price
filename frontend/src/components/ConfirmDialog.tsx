import { ReactNode } from "react";

interface Props {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title, children, confirmLabel = "Подтвердить", confirmDisabled, danger, onConfirm, onCancel,
}: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>Отмена</button>
          <button className={danger ? "danger" : ""} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
