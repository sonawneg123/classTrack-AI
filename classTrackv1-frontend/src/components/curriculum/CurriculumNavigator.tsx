// src/components/curriculum/CurriculumNavigator.tsx
//
// Sprint 7 — Reusable cascading curriculum selector.
//
// Renders four cascading MUI Select dropdowns:
//   Curriculum → Subject → Chapter → Topic
//
// Each downstream dropdown resets and disables when its parent changes.
// Calls onTopicSelect({ topicId, topicName }) when a topic is selected,
// or onTopicSelect(null) when the selection is cleared.
//
// Uses existing hooks from useKnowledge.ts — NO new backend endpoints.

import {
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
} from "@mui/material";
import { useState } from "react";
import { useCurricula, useSubjects, useChapters, useTopics } from "@features/knowledge/hooks/useKnowledge";

export interface TopicSelection {
  topicId: number;
  topicName: string;
}

export interface CurriculumNavigatorProps {
  /** Called when a topic is selected (or null if cleared) */
  onTopicSelect: (selection: TopicSelection | null) => void;
  /** Optional heading label shown above the dropdowns */
  label?: string;
  /** When true, all dropdowns are disabled */
  disabled?: boolean;
  /** Optional size variant */
  size?: "small" | "medium";
}

export function CurriculumNavigator({
  onTopicSelect,
  disabled = false,
  size = "small",
}: CurriculumNavigatorProps) {
  const [curriculumId, setCurriculumId] = useState<number | "">("");
  const [subjectId,    setSubjectId]    = useState<number | "">("");
  const [chapterId,    setChapterId]    = useState<number | "">("");
  const [topicId,      setTopicId]      = useState<number | "">("");

  const curricula = useCurricula();
  const subjects  = useSubjects(curriculumId !== "" ? curriculumId : null);
  const chapters  = useChapters(subjectId    !== "" ? subjectId    : null);
  const topics    = useTopics(chapterId      !== "" ? chapterId     : null);

  // ── Cascade reset helpers ─────────────────────────────────────────────────

  const handleCurriculumChange = (value: number | "") => {
    setCurriculumId(value);
    setSubjectId("");
    setChapterId("");
    setTopicId("");
    onTopicSelect(null);
  };

  const handleSubjectChange = (value: number | "") => {
    setSubjectId(value);
    setChapterId("");
    setTopicId("");
    onTopicSelect(null);
  };

  const handleChapterChange = (value: number | "") => {
    setChapterId(value);
    setTopicId("");
    onTopicSelect(null);
  };

  const handleTopicChange = (value: number | "") => {
    setTopicId(value);
    if (value === "") {
      onTopicSelect(null);
    } else {
      const topicList = topics.data?.topics ?? [];
      const found = topicList.find((t) => t.id === value);
      onTopicSelect(found ? { topicId: found.id, topicName: found.name } : null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack spacing={1.5}>
      {/* Curriculum */}
      <FormControl size={size} fullWidth disabled={disabled || curricula.isLoading}>
        <InputLabel>Curriculum</InputLabel>
        <Select
          value={curriculumId}
          label="Curriculum"
          onChange={(e) => handleCurriculumChange(e.target.value as number | "")}
          endAdornment={
            curricula.isLoading ? (
              <InputAdornment position="end" sx={{ mr: 2 }}>
                <CircularProgress size={14} />
              </InputAdornment>
            ) : null
          }
        >
          <MenuItem value=""><em>Select curriculum…</em></MenuItem>
          {(curricula.data?.curricula ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Subject */}
      <FormControl
        size={size}
        fullWidth
        disabled={disabled || !curriculumId || subjects.isLoading}
      >
        <InputLabel>Subject</InputLabel>
        <Select
          value={subjectId}
          label="Subject"
          onChange={(e) => handleSubjectChange(e.target.value as number | "")}
          endAdornment={
            subjects.isLoading && curriculumId ? (
              <InputAdornment position="end" sx={{ mr: 2 }}>
                <CircularProgress size={14} />
              </InputAdornment>
            ) : null
          }
        >
          <MenuItem value=""><em>Select subject…</em></MenuItem>
          {(subjects.data?.subjects ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Chapter */}
      <FormControl
        size={size}
        fullWidth
        disabled={disabled || !subjectId || chapters.isLoading}
      >
        <InputLabel>Chapter</InputLabel>
        <Select
          value={chapterId}
          label="Chapter"
          onChange={(e) => handleChapterChange(e.target.value as number | "")}
          endAdornment={
            chapters.isLoading && subjectId ? (
              <InputAdornment position="end" sx={{ mr: 2 }}>
                <CircularProgress size={14} />
              </InputAdornment>
            ) : null
          }
        >
          <MenuItem value=""><em>Select chapter…</em></MenuItem>
          {(chapters.data?.chapters ?? []).map((ch) => (
            <MenuItem key={ch.id} value={ch.id}>{ch.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Topic */}
      <FormControl
        size={size}
        fullWidth
        disabled={disabled || !chapterId || topics.isLoading}
      >
        <InputLabel>Topic</InputLabel>
        <Select
          value={topicId}
          label="Topic"
          onChange={(e) => handleTopicChange(e.target.value as number | "")}
          endAdornment={
            topics.isLoading && chapterId ? (
              <InputAdornment position="end" sx={{ mr: 2 }}>
                <CircularProgress size={14} />
              </InputAdornment>
            ) : null
          }
        >
          <MenuItem value=""><em>Select topic…</em></MenuItem>
          {(topics.data?.topics ?? []).map((t) => (
            <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}
