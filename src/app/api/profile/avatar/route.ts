import { NextRequest, NextResponse } from "next/server";
import { accessErrorResponse, requireActiveUser } from "@/lib/access";
import { MAX_PROFILE_PHOTO_BYTES, validateProfileImage } from "@/lib/profile";

async function updateAvatarPath(
  context: Awaited<ReturnType<typeof requireActiveUser>>,
  avatarPath: string | null
) {
  return context.service
    .from("profiles")
    .update({ avatar_path: avatarPath, profile_updated_at: new Date().toISOString() })
    .eq("id", context.profile.id);
}

export async function POST(request: NextRequest) {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }

  const form = await request.formData();
  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload" }, { status: 400 });
  }
  if (photo.size > MAX_PROFILE_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photo must be smaller than 2 MB" }, { status: 400 });
  }

  let validated;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await photo.arrayBuffer());
    validated = await validateProfileImage(bytes);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid image" },
      { status: 400 }
    );
  }

  const path = `${context.profile.id}/avatar-${crypto.randomUUID()}.${validated.extension}`;
  const storage = context.service.storage.from("profile-photos");
  const { error: uploadError } = await storage.upload(path, validated.sanitizedBytes, {
    contentType: validated.mimeType,
    upsert: false,
    cacheControl: "3600",
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: profileError } = await updateAvatarPath(context, path);
  if (profileError) {
    await storage.remove([path]);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }
  if (context.profile.avatar_path) await storage.remove([context.profile.avatar_path]);
  const { data: signed } = await storage.createSignedUrl(path, 60 * 60);
  return NextResponse.json({
    avatarPath: path,
    avatarUrl: signed?.signedUrl ?? null,
    width: validated.width,
    height: validated.height,
  });
}

export async function DELETE() {
  let context;
  try {
    context = await requireActiveUser();
  } catch (error) {
    return accessErrorResponse(error) ?? NextResponse.json({ error: "Authorization failed" }, { status: 500 });
  }
  const { error } = await updateAvatarPath(context, null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (context.profile.avatar_path) {
    await context.service.storage.from("profile-photos").remove([context.profile.avatar_path]);
  }
  return NextResponse.json({ removed: true });
}
