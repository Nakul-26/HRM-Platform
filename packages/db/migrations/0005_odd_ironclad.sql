CREATE TABLE "pay_component_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"calculation_type" text DEFAULT 'fixed' NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pay_component_types_tenant_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "payroll_tax_config" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"pf_employee_rate" numeric(5, 4) DEFAULT '0.12' NOT NULL,
	"pf_employer_rate" numeric(5, 4) DEFAULT '0.12' NOT NULL,
	"pf_wage_ceiling" numeric(12, 2),
	"esi_employee_rate" numeric(5, 4) DEFAULT '0.0075' NOT NULL,
	"esi_employer_rate" numeric(5, 4) DEFAULT '0.0325' NOT NULL,
	"esi_wage_threshold" numeric(12, 2) DEFAULT '21000' NOT NULL,
	"standard_deduction" numeric(12, 2) DEFAULT '75000' NOT NULL,
	"cess_rate" numeric(5, 4) DEFAULT '0.04' NOT NULL,
	"tax_slabs" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pay_component_types" ADD CONSTRAINT "pay_component_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_config" ADD CONSTRAINT "payroll_tax_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_tenant_employee_effective_unique" UNIQUE("tenant_id","employee_id","effective_from");