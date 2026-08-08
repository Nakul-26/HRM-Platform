ALTER TABLE "user" ADD COLUMN "role_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_email_unique" ON "user" USING btree ("tenant_id","email");