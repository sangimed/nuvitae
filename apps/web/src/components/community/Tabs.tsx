"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly defaultTab?: string;
}

export function Tabs({ label, items, defaultTab }: TabsProps) {
  const availableItems = items.filter((item) => !item.disabled);
  const initialTab =
    availableItems.find((item) => item.id === defaultTab)?.id ??
    availableItems[0]?.id ??
    items[0]?.id;
  const [activeTab, setActiveTab] = useState(initialTab);
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function selectFromKeyboard(event: KeyboardEvent, currentId: string) {
    const currentIndex = availableItems.findIndex(
      (item) => item.id === currentId,
    );
    if (currentIndex < 0 || availableItems.length === 0) return;

    let nextIndex: number | undefined;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % availableItems.length;
    if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + availableItems.length) % availableItems.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = availableItems.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextId = availableItems[nextIndex]?.id;
    if (nextId === undefined) return;
    setActiveTab(nextId);
    tabRefs.current.get(nextId)?.focus();
  }

  if (items.length === 0) return null;

  return (
    <div className="community-tabs">
      <div className="community-tab-list" role="tablist" aria-label={label}>
        {items.map((item) => {
          const selected = item.id === activeTab;
          const tabId = `${baseId}-${item.id}-tab`;
          const panelId = `${baseId}-${item.id}-panel`;
          return (
            <button
              type="button"
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={selected}
              disabled={item.disabled}
              tabIndex={selected ? 0 : -1}
              key={item.id}
              ref={(node) => {
                if (node === null) tabRefs.current.delete(item.id);
                else tabRefs.current.set(item.id, node);
              }}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(event) => selectFromKeyboard(event, item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          className="community-tab-panel"
          role="tabpanel"
          id={`${baseId}-${item.id}-panel`}
          aria-labelledby={`${baseId}-${item.id}-tab`}
          hidden={item.id !== activeTab}
          tabIndex={0}
          key={item.id}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
