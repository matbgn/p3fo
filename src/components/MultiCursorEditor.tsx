import React, { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  placeholder as cmPlaceholder,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { selectNextOccurrence } from '@codemirror/search';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

export interface MultiCursorEditorHandle {
  getValue: () => string;
  focus: () => void;
}

interface MultiCursorEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  onReady?: (handle: MultiCursorEditorHandle) => void;
}

const MultiCursorEditor: React.FC<MultiCursorEditorProps> = ({
  value,
  onChange,
  placeholder,
  editable = true,
  className,
  onReady,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const editableRef = useRef(editable);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        onChangeRef.current(u.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        lineNumbers(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        EditorView.lineWrapping,
        // Enable multiple cursors/selections so Alt+click and Ctrl+D
        // (select next occurrence) can add additional selections.
        EditorState.allowMultipleSelections.of(true),
        // VS Code-style: Alt+click adds a cursor (CM defaults to Ctrl+click
        // on Windows/Linux and Cmd+click on Mac).
        EditorView.clickAddsSelectionRange.of((event) => event.altKey),
        // VS Code-style: Alt+drag creates a vertical/column selection
        // (one cursor per line within the dragged rectangle). The
        // crosshair cursor is shown while Alt is held as a visual hint.
        rectangularSelection(),
        crosshairCursor(),
        EditorState.readOnly.of(!editableRef.current),
        placeholder ? cmPlaceholder(placeholder) : [],
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
        ]),
        updateListener,
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    if (onReady) {
      onReady({
        getValue: () => view.state.doc.toString(),
        focus: () => view.focus(),
      });
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor without resetting cursors.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={hostRef} className={`${className ?? ''} cm-editor-host`} />;
};

export default MultiCursorEditor;