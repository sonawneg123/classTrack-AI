import { apiClient } from "@services/apiClient";
import type { ApiResponse } from "@/types/common";
import type { StudentAssignment } from "@/types/studentAssignment";

export const studentApi = {
  async getMyAssignments(): Promise<StudentAssignment[]> {
    const { data } = await apiClient.get<ApiResponse<{ tasks: StudentAssignment[] }>>("/student/tasks");
    if (!data.success) throw new Error(data.message);
    return data.data.tasks;
  },
};
