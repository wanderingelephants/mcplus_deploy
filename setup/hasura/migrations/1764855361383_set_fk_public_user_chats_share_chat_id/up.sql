alter table "public"."user_chats_share"
  add constraint "user_chats_share_chat_id_fkey"
  foreign key ("chat_id")
  references "public"."user_chats"
  ("id") on update restrict on delete restrict;
