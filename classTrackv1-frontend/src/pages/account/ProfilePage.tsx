/**
 * src/pages/account/ProfilePage.tsx
 *
 * Profile page — available for Admin, Teacher, and Student roles.
 *
 * Displays:
 *   - Current avatar with Change / Remove actions
 *   - Name, email / username, role
 *   - Account status info
 *
 * The avatar upload UX now opens an inline crop/adjust dialog:
 *   1. User selects an image file
 *   2. AvatarCropDialog opens (circular crop, zoom, pan)
 *   3. User confirms the crop
 *   4. Cropped JPEG is uploaded via PUT /account/profile/photo
 *   5. Avatar updates immediately without a page refresh
 */
import { useRef, useState, type ChangeEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { DashboardLayout } from "@layouts/DashboardLayout";
import { useAuth } from "@app/AuthProvider";
import { UserAvatar } from "@components/ui/UserAvatar";
import { AvatarCropDialog } from "@components/ui/AvatarCropDialog";
import {
  useProfile,
  useUploadAvatar,
  useDeleteAvatar,
  validateAvatarFile,
} from "@features/account/hooks/useProfile";

// ── Role label helper ─────────────────────────────────────────────────────────
function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

// ── Profile info row ───────────────────────────────────────────────────────────
function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }}>
        {value ?? <span style={{ color: "#9AA6C0" }}>—</span>}
      </Typography>
    </Box>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  const uploadMutation = useUploadAvatar();
  const deleteMutation = useDeleteAvatar();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError,  setFileError]  = useState<string | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  // File staged for crop dialog — null means dialog closed
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const isMutating = uploadMutation.isPending || deleteMutation.isPending;

  const handleSelectFile = () => {
    setFileError(null);
    fileInputRef.current?.click();
  };

  /** Called when the user picks a file — validates then opens crop dialog. */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation (type + size)
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setFileError(validationError);
      e.target.value = "";
      return;
    }

    // Stage the file — this opens the crop dialog
    setPendingFile(file);
    // Reset the file input now so the same file can be re-selected later
    e.target.value = "";
  };

  /** Called when the user confirms the crop in the dialog. */
  const handleCropConfirm = (croppedFile: File) => {
    setPendingFile(null);

    // Show a local preview immediately for snappy UX while uploading
    const objectUrl = URL.createObjectURL(croppedFile);
    setPreview(objectUrl);

    uploadMutation.mutate(croppedFile, {
      onSettled: () => {
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
      },
    });
  };

  /** Called when the user cancels the crop dialog. */
  const handleCropCancel = () => {
    setPendingFile(null);
  };

  const handleRemove = () => {
    setFileError(null);
    deleteMutation.mutate();
  };

  if (!user) return null;

  // Determine which avatarUrl to display:
  //   1. Local preview (just uploaded, pending server confirmation)
  //   2. Profile data from server
  //   3. Fallback in UserAvatar (initials)
  const displayAvatarUrl = preview ?? (profile?.avatarUrl ?? user.profile.avatarUrl);
  const hasPhoto = Boolean(displayAvatarUrl);

  const displayName     = profile?.name     ?? user.name;
  const displayEmail    = profile?.email    ?? user.profile.email;
  const displayUsername = profile?.username ?? user.profile.username;

  return (
    <DashboardLayout
      title="My Profile"
      description="Manage your account information and profile photo."
    >
      <Box sx={{ maxWidth: 640, mx: "auto", mt: 2 }}>
        <Card>
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Profile
            </Typography>
            <Divider sx={{ mb: 3 }} />

            {/* ── Avatar section ── */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={3}
              alignItems={{ xs: "center", sm: "flex-start" }}
              sx={{ mb: 3 }}
            >
              {/* Avatar with optional upload overlay */}
              <Box sx={{ position: "relative", flexShrink: 0 }}>
                <UserAvatar
                  name={displayName}
                  avatarUrl={displayAvatarUrl}
                  size="xl"
                  loading={profileLoading}
                />
                {isMutating && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: "50%",
                      bgcolor: "rgba(0,0,0,0.45)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CircularProgress size={28} sx={{ color: "#fff" }} />
                  </Box>
                )}
              </Box>

              {/* Actions */}
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {displayName}
                </Typography>
                <Chip
                  label={roleLabel(user.role)}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ mt: 0.5, mb: 2 }}
                />

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Tooltip title="Upload a JPEG, PNG, or WebP image (max 5 MB)">
                    <span>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<PhotoCameraOutlinedIcon />}
                        onClick={handleSelectFile}
                        disabled={isMutating}
                        aria-label="Change profile photo"
                      >
                        {hasPhoto ? "Change photo" : "Upload photo"}
                      </Button>
                    </span>
                  </Tooltip>

                  {hasPhoto && !preview && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={handleRemove}
                      disabled={isMutating}
                      aria-label="Remove profile photo"
                    >
                      Remove photo
                    </Button>
                  )}
                </Stack>

                {/* Client-side validation error */}
                {fileError && (
                  <Alert severity="error" sx={{ mt: 1.5, py: 0.5 }}>
                    {fileError}
                  </Alert>
                )}

                {/* Hidden file input — triggers crop dialog, not direct upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                  aria-label="Select profile photo file"
                />
              </Box>
            </Stack>

            <Divider sx={{ mb: 3 }} />

            {/* ── Account info ── */}
            <Stack spacing={2}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: "0.04em" }}>
                ACCOUNT INFORMATION
              </Typography>

              <InfoRow label="Full name" value={displayName} />

              {displayEmail && (
                <InfoRow label="Email address" value={displayEmail} />
              )}

              {displayUsername && (
                <InfoRow label="Username" value={displayUsername} />
              )}

              <InfoRow label="Role" value={roleLabel(user.role)} />

              {profile?.classroomId != null && (
                <InfoRow label="Classroom ID" value={String(profile.classroomId)} />
              )}

              <InfoRow
                label="Account status"
                value={profile?.isActive ?? user.profile.isActive ? "Active" : "Inactive"}
              />

              <InfoRow
                label="Member since"
                value={
                  profile?.createdAt
                    ? new Date(profile.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : null
                }
              />

              {profile?.lastLoginAt && (
                <InfoRow
                  label="Last login"
                  value={new Date(profile.lastLoginAt).toLocaleString()}
                />
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* ── Crop / adjust dialog ── */}
      <AvatarCropDialog
        file={pendingFile}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />
    </DashboardLayout>
  );
}
