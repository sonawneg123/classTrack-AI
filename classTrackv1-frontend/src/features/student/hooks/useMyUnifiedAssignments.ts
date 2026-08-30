/**
 * src/features/student/hooks/useMyUnifiedAssignments.ts
 *
 * Fetches BOTH file-submission Tasks and Quiz Assignments for the student
 * in parallel, merges them into a single sorted list, and returns a unified
 * discriminated-union array.
 *
 * The underlying queries are:
 *   GET /student/tasks               → tasks list
 *   GET /student/quiz-assignments    → published quizzes for this classroom
 *
 * Both are cached independently by React Query; this hook combines them.
 * Either query failing does not suppress the other — partial data is shown.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '../api/studentApi';
import { quizAssignmentApi } from '@features/quizAssignments/api/quizAssignmentApi';
import {
  toUnifiedTask,
  toUnifiedQuiz,
  type UnifiedAssignment,
  type UnifiedAssignmentStatus,
} from '@/types/unifiedAssignment';

const STATUS_ORDER: UnifiedAssignmentStatus[] = ['upcoming', 'submitted', 'pending', 'overdue'];

export function useMyUnifiedAssignments() {
  const tasksQuery = useQuery({
    queryKey: ['student', 'assignments'],
    queryFn: studentApi.getMyAssignments,
    refetchOnWindowFocus: true,
  });

  const quizzesQuery = useQuery({
    queryKey: ['quiz-assignments', 'student', 'list'],
    queryFn: () => quizAssignmentApi.listMine(),
    refetchOnWindowFocus: true,
  });

  const unified = useMemo<UnifiedAssignment[]>(() => {
    const tasks = (tasksQuery.data ?? []).map(toUnifiedTask);
    const quizzes = ((quizzesQuery.data?.quizzes) ?? []).map(toUnifiedQuiz);
    const all: UnifiedAssignment[] = [...tasks, ...quizzes];

    // Sort: by assignment_status weight first, then by due_date ASC (null last)
    all.sort((a, b) => {
      const aWeight = STATUS_ORDER.indexOf(a.assignment_status);
      const bWeight = STATUS_ORDER.indexOf(b.assignment_status);
      if (aWeight !== bWeight) return aWeight - bWeight;
      // Within same status, sort by due_date ascending (null = no due date → last)
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    return all;
  }, [tasksQuery.data, quizzesQuery.data]);

  return {
    data: unified,
    isLoading: tasksQuery.isLoading || quizzesQuery.isLoading,
    isError: tasksQuery.isError && quizzesQuery.isError,
    tasksError: tasksQuery.isError,
    quizzesError: quizzesQuery.isError,
  };
}
