/**
 * Hand-written database types. Mirrors supabase/migrations/*.sql.
 * Regenerate with the Supabase CLI once the project is linked:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types.gen.ts
 */

export type ConversationType = "dm" | "group";
export type MessageType = "text" | "image" | "file" | "system" | "call_event";
export type CallKind = "audio" | "video";
export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined";
export type MemberRole = "member" | "admin";
export type ContactStatus = "pending" | "accepted" | "blocked";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  status_message: string | null;
  last_seen_at: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role: MemberRole;
  last_read_at: string;
  muted: boolean;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  type: MessageType;
  content: string | null;
  attachment_url: string | null;
  attachment_meta: Record<string, unknown> | null;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface MessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface Contact {
  user_id: string;
  contact_id: string;
  status: ContactStatus;
  created_at: string;
}

export interface Call {
  id: string;
  conversation_id: string;
  started_by: string | null;
  kind: CallKind;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
}

export interface CallParticipant {
  call_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
}

// ─── Composite shapes used across the UI ───────────────────────────────────
export interface MessageWithSender extends Message {
  sender: Profile | null;
  reactions: MessageReaction[];
}

export interface ConversationSummary {
  conversation: Conversation;
  members: (ConversationMember & { profile: Profile })[];
  last_message: Message | null;
  unread_count: number;
  /** For DMs: the other participant. */
  peer: Profile | null;
  title: string;
  avatar_url: string | null;
}

type Row<T> = T;
type Insert<T> = Partial<T>;
type Update<T> = Partial<T>;

interface TableDef<R> {
  Row: Row<R>;
  Insert: Insert<R>;
  Update: Update<R>;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      conversations: TableDef<Conversation>;
      conversation_members: TableDef<ConversationMember>;
      messages: TableDef<Message>;
      message_reactions: TableDef<MessageReaction>;
      contacts: TableDef<Contact>;
      calls: TableDef<Call>;
      call_participants: TableDef<CallParticipant>;
    };
    Views: Record<string, never>;
    Functions: {
      get_or_create_dm: { Args: { other_user: string }; Returns: string };
      create_group: { Args: { p_title: string; p_member_ids: string[] }; Returns: string };
      add_group_members: {
        Args: { p_conversation_id: string; p_member_ids: string[] };
        Returns: undefined;
      };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined };
      search_profiles: { Args: { q: string }; Returns: Profile[] };
    };
    Enums: {
      conversation_type: ConversationType;
      message_type: MessageType;
      call_kind: CallKind;
      call_status: CallStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
