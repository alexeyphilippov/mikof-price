export default function RequestCommentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>Комментарий</label>
      <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Пояснение для согласующих (необязательно)" />
    </div>
  );
}
