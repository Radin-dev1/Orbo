"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/SessionProvider";
import { useMessages } from "@/lib/hooks/useMessages";
import { useTyping } from "@/lib/hooks/useTyping";
import { useCall } from "@/lib/rtc/CallProvider";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { GroupInfoDialog } from "@/components/chat/GroupInfoDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { Conversation, ConversationMember, Profile } from "@/lib/types";

type MemberWithProfile = ConversationMember & { profile: Profile };

export function ChatView({ conversationId }: { conversationId: string }) {
  const { supabase, user, isOnline } = useSession();
  const router = useRouter();
  const { startCall, active } = useCall();

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);

  const {
    messages,
    loading: msgLoading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useMessages(conversationId);
  const { typingUsers, notifyTyping, notifyStopTyping } = useTyping(conversationId);

  const loadMeta = useCallback(async () => {
    const [{ data: conv }, { data: mem }] = await Promise.all([
      supabase.from("conversations").select("*").eq("id", conversationId).single(),
      supabase
        .from("conversation_members")
        .select("*, profile:profiles(*)")
        .eq("conversation_id", conversationId),
    ]);
    setConversation((conv as Conversation) ?? null);
    setMembers(((mem ?? []) as MemberWithProfile[]) ?? []);
    setLoading(false);
  }, [supabase, conversationId]);

  useEffect(() => {
    setLoading(true);
    void loadMeta();
  }, [loadMeta]);

  // React to membership changes (people added / removed / renamed group).
  useEffect(() => {
    const channel = supabase
      .channel(`conv-meta:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => void loadMeta(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversationId}` },
        ({ new: row }) => setConversation(row as Conversation),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, loadMeta]);

  // Mark read on load + whenever a new message lands while this view is open.
  const lastCount = useRef(0);
  useEffect(() => {
    if (messages.length === lastCount.current) return;
    lastCount.current = messages.length;
    const t = setTimeout(() => {
      void supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    }, 400);
    return () => clearTimeout(t);
  }, [messages.length, supabase, conversationId]);

  if (loading || !conversation) return <FullPageSpinner />;

  const isGroup = conversation.type === "group";
  const others = members.filter((m) => m.user_id !== user.id);
  const peer = isGroup ? null : others[0]?.profile ?? null;
  const title = isGroup ? conversation.title || "Group chat" : peer?.display_name ?? "Direct message";

  const presenceLabel = isGroup
    ? `${members.length} members${
        others.some((m) => isOnline(m.user_id)) ? " · some online" : ""
      }`
    : peer && isOnline(peer.id)
      ? "Online"
      : peer
        ? "Offline"
        : "";

  const inThisCall = active?.conversationId === conversationId;

  return (
    <div className="flex h-full flex-col bg-bg">
      <ChatHeader
        title={title}
        subtitle={presenceLabel}
        avatarId={peer?.id ?? conversation.id}
        avatarUrl={isGroup ? conversation.avatar_url : peer?.avatar_url}
        isGroup={isGroup}
        online={peer ? isOnline(peer.id) : false}
        inCall={!!inThisCall}
        onBack={() => router.push("/")}
        onInfo={() => setShowInfo(true)}
        onAudioCall={() => startCall(conversationId, "audio")}
        onVideoCall={() => startCall(conversationId, "video")}
      />

      <MessageList
        messages={messages}
        loading={msgLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        members={members}
        isGroup={isGroup}
        typingUsers={typingUsers}
        onEdit={editMessage}
        onDelete={deleteMessage}
        onReact={toggleReaction}
      />

      <Composer
        conversationId={conversationId}
        onSend={sendMessage}
        onTyping={notifyTyping}
        onStopTyping={notifyStopTyping}
      />

      <GroupInfoDialog
        open={showInfo}
        onClose={() => setShowInfo(false)}
        conversation={conversation}
        members={members}
        onChanged={loadMeta}
      />
    </div>
  );
}
