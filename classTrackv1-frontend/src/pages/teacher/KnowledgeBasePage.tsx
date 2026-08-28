// src/pages/teacher/KnowledgeBasePage.tsx
//
// Teacher Knowledge Base — Sprint 2
// Hierarchical browser: Curriculum → Subject → Chapter → Topic → Documents
// Upload, retry, and archive knowledge documents from here.

import { useState, useRef } from "react";
import {
  Box, Button, Chip, CircularProgress, Collapse,
  Divider, IconButton, LinearProgress, List, ListItemButton, ListItemIcon,
  ListItemText, Paper, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchIcon from "@mui/icons-material/Search";
import { DashboardLayout } from "@layouts/DashboardLayout";
import {
  useCurricula, useCreateCurriculum, useDeleteCurriculum,
  useSubjects, useCreateSubject, useDeleteSubject,
  useChapters, useCreateChapter, useDeleteChapter,
  useTopics, useCreateTopic, useDeleteTopic,
  useDocuments, useUploadDocument, useRetryDocument, useArchiveDocument,
  useKnowledgeSearch,
} from "@features/knowledge/hooks/useKnowledge";
import type { Curriculum, Subject, Chapter, Topic, KnowledgeDocument, SearchResult } from "@/types/knowledge";

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const map: Record<string, "default" | "info" | "success" | "error" | "warning"> = {
    uploaded: "default",
    processing: "info",
    ready: "success",
    failed: "error",
  };
  return (
    <Chip
      label={status}
      color={map[status] ?? "default"}
      size="small"
      sx={{ textTransform: "capitalize", fontSize: 11 }}
    />
  );
}

// ── Inline add form ───────────────────────────────────────────────────────────
function InlineAddForm({
  placeholder,
  onSubmit,
  loading,
}: {
  placeholder: string;
  onSubmit: (name: string) => void;
  loading: boolean;
}) {
  const [val, setVal] = useState("");
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 2, py: 0.5 }}>
      <TextField
        size="small"
        placeholder={placeholder}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) { onSubmit(val.trim()); setVal(""); }
        }}
        sx={{ flex: 1 }}
        disabled={loading}
      />
      <Button
        size="small"
        variant="contained"
        disabled={!val.trim() || loading}
        onClick={() => { onSubmit(val.trim()); setVal(""); }}
      >
        Add
      </Button>
    </Stack>
  );
}

// ── Document list for a topic ─────────────────────────────────────────────────
function DocumentList({ topicId }: { topicId: number }) {
  const { data, isLoading } = useDocuments(topicId);
  const uploadMutation   = useUploadDocument();
  const retryMutation    = useRetryDocument();
  const archiveMutation  = useArchiveDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documents: KnowledgeDocument[] = data?.documents ?? [];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    uploadMutation.mutate({ topicId, formData: fd });
    e.target.value = "";
  }

  if (isLoading) return <LinearProgress sx={{ mx: 2 }} />;

  return (
    <Box sx={{ pl: 4, pr: 2, pb: 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary">Documents</Typography>
        <Tooltip title="Upload document (PDF, DOCX, TXT)">
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <UploadFileIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </Stack>

      {documents.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ pl: 1, fontStyle: "italic" }}>
          No documents yet. Upload a PDF, DOCX, or TXT file.
        </Typography>
      )}

      {documents.map((doc) => (
        <Paper
          key={doc.id}
          variant="outlined"
          sx={{ mb: 1, p: 1.5, borderRadius: 1 }}
        >
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <InsertDriveFileOutlinedIcon fontSize="small" color="action" sx={{ mt: 0.2 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: "break-word" }}>
                  {doc.title}
                </Typography>
                <Chip label={doc.file_type.toUpperCase()} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                <StatusChip status={doc.status} />
                {doc.version > 1 && (
                  <Chip label={`v${doc.version}`} size="small" variant="outlined" color="secondary" sx={{ fontSize: 10 }} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {doc.original_filename}
                {doc.total_chunks != null && ` • ${doc.total_chunks} chunks`}
                {doc.file_size_bytes != null && ` • ${(doc.file_size_bytes / 1024).toFixed(1)} KB`}
                {" • "}
                {new Date(doc.created_at).toLocaleDateString()}
              </Typography>
              {doc.status === "failed" && doc.failure_message && (
                <Typography variant="caption" color="error" display="block" sx={{ mt: 0.25 }}>
                  ⚠ {doc.failure_message}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5}>
              {doc.status === "failed" && (
                <Tooltip title="Retry processing">
                  <IconButton
                    size="small"
                    onClick={() => retryMutation.mutate({ documentId: doc.id, topicId })}
                    disabled={retryMutation.isPending}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {(doc.status === "processing" || doc.status === "uploaded") && (
                <CircularProgress size={16} thickness={5} sx={{ m: 0.5 }} />
              )}
              <Tooltip title="Archive document">
                <IconButton
                  size="small"
                  onClick={() => archiveMutation.mutate({ documentId: doc.id, topicId })}
                  disabled={archiveMutation.isPending}
                >
                  <DeleteOutlineIcon fontSize="small" color="error" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
        </Paper>
      ))}
    </Box>
  );
}

// ── Topic item ────────────────────────────────────────────────────────────────
function TopicItem({ topic, chapterId }: { topic: Topic; chapterId: number }) {
  const [open, setOpen] = useState(false);
  const deleteMutation = useDeleteTopic();

  return (
    <>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ pl: 6 }}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          <InsertDriveFileOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={topic.name} primaryTypographyProps={{ variant: "body2" }} />
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        <Tooltip title="Delete topic">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: topic.id, chapterId }); }}
            disabled={deleteMutation.isPending}
            sx={{ ml: 0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" color="error" />
          </IconButton>
        </Tooltip>
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        <DocumentList topicId={topic.id} />
      </Collapse>
    </>
  );
}

// ── Chapter item ──────────────────────────────────────────────────────────────
function ChapterItem({ chapter, subjectId }: { chapter: Chapter; subjectId: number }) {
  const [open, setOpen] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const { data: topicData, isLoading } = useTopics(open ? chapter.id : null);
  const createTopic  = useCreateTopic();
  const deleteChapter = useDeleteChapter();

  const topics: Topic[] = topicData?.topics ?? [];

  return (
    <>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ pl: 4 }}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          <FolderOpenIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={chapter.name} primaryTypographyProps={{ variant: "body2", fontWeight: 500 }} />
        {isLoading && open && <CircularProgress size={14} sx={{ mr: 1 }} />}
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        <Tooltip title="Delete chapter">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); deleteChapter.mutate({ id: chapter.id, subjectId }); }}
            disabled={deleteChapter.isPending}
            sx={{ ml: 0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" color="error" />
          </IconButton>
        </Tooltip>
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        {topics.map((t) => <TopicItem key={t.id} topic={t} chapterId={chapter.id} />)}
        {addingTopic ? (
          <InlineAddForm
            placeholder="New topic name…"
            loading={createTopic.isPending}
            onSubmit={(name) => {
              createTopic.mutate({ chapterId: chapter.id, payload: { name } }, {
                onSuccess: () => setAddingTopic(false),
              });
            }}
          />
        ) : (
          <Box sx={{ pl: 6, pb: 0.5 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingTopic(true)}>
              Add Topic
            </Button>
          </Box>
        )}
      </Collapse>
    </>
  );
}

// ── Subject item ──────────────────────────────────────────────────────────────
function SubjectItem({ subject, curriculumId }: { subject: Subject; curriculumId: number }) {
  const [open, setOpen] = useState(false);
  const [addingChapter, setAddingChapter] = useState(false);
  const { data: chapterData, isLoading } = useChapters(open ? subject.id : null);
  const createChapter  = useCreateChapter();
  const deleteSubject  = useDeleteSubject();

  const chapters: Chapter[] = chapterData?.chapters ?? [];

  return (
    <>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ pl: 2 }}>
        <ListItemIcon sx={{ minWidth: 28 }}>
          <FolderOpenIcon fontSize="small" color="primary" />
        </ListItemIcon>
        <ListItemText primary={subject.name} primaryTypographyProps={{ fontWeight: 600 }} />
        {isLoading && open && <CircularProgress size={14} sx={{ mr: 1 }} />}
        {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        <Tooltip title="Delete subject">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); deleteSubject.mutate({ id: subject.id, curriculumId }); }}
            disabled={deleteSubject.isPending}
            sx={{ ml: 0.5 }}
          >
            <DeleteOutlineIcon fontSize="small" color="error" />
          </IconButton>
        </Tooltip>
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        {chapters.map((ch) => <ChapterItem key={ch.id} chapter={ch} subjectId={subject.id} />)}
        {addingChapter ? (
          <InlineAddForm
            placeholder="New chapter name…"
            loading={createChapter.isPending}
            onSubmit={(name) => {
              createChapter.mutate({ subjectId: subject.id, payload: { name } }, {
                onSuccess: () => setAddingChapter(false),
              });
            }}
          />
        ) : (
          <Box sx={{ pl: 4, pb: 0.5 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingChapter(true)}>
              Add Chapter
            </Button>
          </Box>
        )}
      </Collapse>
    </>
  );
}

// ── Curriculum panel ──────────────────────────────────────────────────────────
function CurriculumPanel({ curriculum }: { curriculum: Curriculum }) {
  const [open, setOpen] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const { data: subjectData, isLoading } = useSubjects(open ? curriculum.id : null);
  const createSubject    = useCreateSubject();
  const deleteCurriculum = useDeleteCurriculum();

  const subjects: Subject[] = subjectData?.subjects ?? [];

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderRadius: 2, overflow: "hidden" }}>
      <ListItemButton onClick={() => setOpen(!open)} sx={{ bgcolor: "background.paper" }}>
        <ListItemText
          primary={curriculum.name}
          primaryTypographyProps={{ fontWeight: 700 }}
        />
        {isLoading && open && <CircularProgress size={14} sx={{ mr: 1 }} />}
        {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        <Tooltip title="Delete curriculum (and all its content)">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); deleteCurriculum.mutate(curriculum.id); }}
            disabled={deleteCurriculum.isPending}
            sx={{ ml: 1 }}
          >
            <DeleteOutlineIcon fontSize="small" color="error" />
          </IconButton>
        </Tooltip>
      </ListItemButton>
      <Collapse in={open} unmountOnExit>
        <Divider />
        <List disablePadding>
          {subjects.map((s) => <SubjectItem key={s.id} subject={s} curriculumId={curriculum.id} />)}
        </List>
        {addingSubject ? (
          <InlineAddForm
            placeholder="New subject name…"
            loading={createSubject.isPending}
            onSubmit={(name) => {
              createSubject.mutate({ curriculumId: curriculum.id, payload: { name } }, {
                onSuccess: () => setAddingSubject(false),
              });
            }}
          />
        ) : (
          <Box sx={{ pl: 2, pb: 1 }}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setAddingSubject(true)}>
              Add Subject
            </Button>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Search panel ──────────────────────────────────────────────────────────────
function SearchPanel() {
  const [query, setQuery] = useState("");
  const searchMutation = useKnowledgeSearch();
  const results: SearchResult[] = searchMutation.data?.results ?? [];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Knowledge Search</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search your knowledge base…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) searchMutation.mutate({ query: query.trim() });
          }}
        />
        <Button
          variant="contained"
          startIcon={<SearchIcon />}
          onClick={() => searchMutation.mutate({ query: query.trim() })}
          disabled={!query.trim() || searchMutation.isPending}
        >
          Search
        </Button>
      </Stack>
      {searchMutation.isPending && <LinearProgress sx={{ mb: 2 }} />}
      {results.length === 0 && searchMutation.isSuccess && (
        <Typography color="text.secondary">No results found.</Typography>
      )}
      {results.map((r) => (
        <Paper key={r.chunkId} variant="outlined" sx={{ mb: 1.5, p: 2, borderRadius: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {r.source.curriculum.name} › {r.source.subject.name} › {r.source.chapter.name} › {r.source.topic.name}
            </Typography>
            <Chip
              label={`${(r.similarity * 100).toFixed(1)}% match`}
              size="small"
              color={r.similarity >= 0.8 ? "success" : r.similarity >= 0.5 ? "warning" : "default"}
            />
          </Stack>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {r.text}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
            {r.source.documentTitle} ({r.source.fileType.toUpperCase()}) — chunk #{r.chunkIndex}
          </Typography>
        </Paper>
      ))}
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function KnowledgeBasePage() {
  const [addingCurriculum, setAddingCurriculum] = useState(false);
  const [tab, setTab] = useState<"browse" | "search">("browse");
  const { data, isLoading } = useCurricula();
  const createCurriculum = useCreateCurriculum();

  const curricula: Curriculum[] = data?.curricula ?? [];

  return (
    <DashboardLayout
      title="Knowledge Base"
      description="Upload, organise, and search your curriculum documents."
      breadcrumbs={[{ label: "Knowledge Base" }]}
    >
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button
          variant={tab === "browse" ? "contained" : "outlined"}
          size="small"
          onClick={() => setTab("browse")}
        >
          Browse
        </Button>
        <Button
          variant={tab === "search" ? "contained" : "outlined"}
          size="small"
          startIcon={<SearchIcon />}
          onClick={() => setTab("search")}
        >
          Search
        </Button>
      </Stack>

      {tab === "search" ? (
        <SearchPanel />
      ) : (
        <>
          {isLoading && <LinearProgress sx={{ mb: 2 }} />}

          {curricula.map((c) => (
            <CurriculumPanel key={c.id} curriculum={c} />
          ))}

          {curricula.length === 0 && !isLoading && (
            <Typography color="text.secondary" sx={{ mb: 2, fontStyle: "italic" }}>
              No curricula yet. Create one to get started.
            </Typography>
          )}

          {addingCurriculum ? (
            <InlineAddForm
              placeholder="New curriculum name…"
              loading={createCurriculum.isPending}
              onSubmit={(name) => {
                createCurriculum.mutate({ name }, {
                  onSuccess: () => setAddingCurriculum(false),
                });
              }}
            />
          ) : (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddingCurriculum(true)}
              sx={{ mt: 1 }}
            >
              New Curriculum
            </Button>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
