import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  BarChart3,
  ChevronRight,
  CreditCard,
  Delete,
  Download,
  Repeat,
  Settings2,
  Shapes,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Account, Category, downloadCsv, Operation, Summary } from "../api";
import { ThemeSelect } from "@ui/components/ThemeSelect";
import { Owner } from "@ui/lib/owner";
import { request } from "@ui/lib/api-client";
import { OperationRow } from "../components/OperationRow";
import { Sheet, SheetPresence } from "@ui/components/Sheet";
import { monthLabel } from "@ui/lib/format";
import { useRefresh } from "../lib/useRefresh";
import { AccountsPanel } from "../panels/AccountsPanel";
import { BudgetPanel } from "../panels/BudgetPanel";
import { CategoriesPanel } from "../panels/CategoriesPanel";
import { EntryPanel } from "../panels/EntryPanel";
import { OperationPanel } from "../panels/OperationPanel";
import { SubscriptionsPanel } from "../panels/SubscriptionsPanel";

type EntryType = "income" | "transfer" | "adjustment";
export type MoreSheet =
  | { kind: "accounts" | "categories" | "budget" | "subscriptions" | "trash" }
  | { kind: "entry"; type: EntryType }
  | { kind: "operation"; operation: Operation };

const sheetTitles: Record<MoreSheet["kind"], string> = {
  entry: "Новая операция",
  accounts: "Счета",
  categories: "Категории",
  budget: "Бюджет",
  subscriptions: "Подписки",
  trash: "Удалённые операции",
  operation: "Операция",
};

function MenuRow({
  Icon,
  label,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="menu-row" onClick={onClick}>
      <Icon size={20} />
      {label}
      <ChevronRight size={17} />
    </button>
  );
}

export function MorePage({
  month,
  owner,
  accounts,
  categories,
  summary,
  initialSheet = null,
}: {
  month: string;
  owner: Owner;
  accounts: Account[];
  categories: Category[];
  summary: Summary;
  initialSheet?: MoreSheet | null;
}) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const [sheet, setSheet] = useState<MoreSheet | null>(initialSheet);
  const [error, setError] = useState("");
  const trashQ = useQuery({
    queryKey: ["trash", month],
    queryFn: () =>
      request<{ items: Operation[]; count: number }>(
        "/transactions?" + new URLSearchParams({ month, deleted: "true" }),
      ),
    enabled: sheet?.kind === "trash",
  });
  const activeAccounts = accounts.filter((a) => !a.archived);
  const close = () => setSheet(null);
  const closeAndRefresh = async () => {
    close();
    await refresh();
  };
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Дополнительно</h1>
        </div>
      </div>
      <div className="more-group">
        <h2>Операции</h2>
        <MenuRow
          Icon={ArrowDownLeft}
          label="Добавить доход"
          onClick={() => setSheet({ kind: "entry", type: "income" })}
        />
        <MenuRow
          Icon={ArrowRightLeft}
          label="Перевести между счетами"
          onClick={() => setSheet({ kind: "entry", type: "transfer" })}
        />
        <MenuRow
          Icon={Settings2}
          label="Сверить остаток"
          onClick={() => setSheet({ kind: "entry", type: "adjustment" })}
        />
      </div>
      <div className="more-group">
        <h2>Настройки</h2>
        <MenuRow Icon={CreditCard} label="Счета" onClick={() => setSheet({ kind: "accounts" })} />
        <MenuRow Icon={Shapes} label="Категории" onClick={() => setSheet({ kind: "categories" })} />
        <MenuRow
          Icon={BarChart3}
          label="Месячный бюджет"
          onClick={() => setSheet({ kind: "budget" })}
        />
        <MenuRow
          Icon={Repeat}
          label="Подписки"
          onClick={() => setSheet({ kind: "subscriptions" })}
        />
        <MenuRow
          Icon={Delete}
          label="Недавно удалённые"
          onClick={() => setSheet({ kind: "trash" })}
        />
      </div>
      <ThemeSelect value={owner.theme} onError={setError} />
      <button
        className="menu-row export-row"
        onClick={() => void downloadCsv(month).catch((e) => setError(e.message))}
      >
        <Download size={20} />
        Экспорт операций за {monthLabel(month)}
        <ChevronRight size={17} />
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="timezone">UZS, USD · {owner.timezone}</p>
      <SheetPresence>
        {sheet && (
          <Sheet title={sheetTitles[sheet.kind]} onClose={close}>
            {sheet.kind === "accounts" && <AccountsPanel accounts={accounts} refresh={refresh} />}
            {sheet.kind === "categories" && (
              <CategoriesPanel
                categories={categories}
                onRefresh={() => qc.invalidateQueries({ queryKey: ["categories"] })}
              />
            )}
            {sheet.kind === "budget" && (
              <BudgetPanel month={month} amount={summary.budget} refresh={refresh} />
            )}
            {sheet.kind === "subscriptions" && <SubscriptionsPanel />}
            {sheet.kind === "entry" && (
              <EntryPanel
                type={sheet.type}
                accounts={activeAccounts}
                categories={categories}
                timezone={owner.timezone}
                onDone={closeAndRefresh}
              />
            )}
            {sheet.kind === "trash" && (
              <div className="sheet-body">
                {trashQ.isLoading ? (
                  <p className="sheet-desc">Загружаем…</p>
                ) : trashQ.data?.items.length ? (
                  trashQ.data.items.map((op) => (
                    <OperationRow
                      key={op.id}
                      op={op}
                      timezone={owner.timezone}
                      onClick={() => setSheet({ kind: "operation", operation: op })}
                    />
                  ))
                ) : (
                  <p className="sheet-desc">Удалённых операций за этот месяц нет.</p>
                )}
              </div>
            )}
            {sheet.kind === "operation" && (
              <OperationPanel
                operation={sheet.operation}
                accounts={activeAccounts}
                categories={categories}
                timezone={owner.timezone}
                onDone={closeAndRefresh}
                onRefresh={refresh}
              />
            )}
          </Sheet>
        )}
      </SheetPresence>
    </div>
  );
}
