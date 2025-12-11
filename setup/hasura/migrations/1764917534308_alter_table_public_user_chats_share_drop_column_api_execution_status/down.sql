alter table "public"."user_chats_share" alter column "api_execution_status" drop not null;
alter table "public"."user_chats_share" add column "api_execution_status" text;
