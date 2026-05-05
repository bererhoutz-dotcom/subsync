import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const reminderEmailTo = Deno.env.get("REMINDER_EMAIL_TO");

    console.log("Function started");

    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
    if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!resendApiKey) throw new Error("Missing RESEND_API_KEY");
    if (!reminderEmailTo) throw new Error("Missing REMINDER_EMAIL_TO");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("id,type,start_date,end_date,user_id");

    if (subscriptionsError) {
      throw new Error(`Subscriptions query failed: ${subscriptionsError.message}`);
    }

    console.log(`Loaded subscriptions: ${subscriptions?.length || 0}`);

    const alerts = (subscriptions || [])
      .map((s) => {
        const endDate = new Date(s.end_date);
        endDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);

        if (diffDays === 0) {
          return {
            service: s.type,
            endDate: s.end_date,
            message: "expires today",
          };
        }

        if (diffDays > 0 && diffDays <= 3) {
          return {
            service: s.type,
            endDate: s.end_date,
            message: `expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`,
          };
        }

        if (diffDays < 0) {
          return {
            service: s.type,
            endDate: s.end_date,
            message: `expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} ago`,
          };
        }

        return null;
      })
      .filter(Boolean);

    console.log(`Alerts to send: ${alerts.length}`);

    if (!alerts.length) {
      return new Response(
        JSON.stringify({ ok: true, message: "No reminders to send" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>SubSync reminders</h2>
        <p>You have ${alerts.length} subscription alert${alerts.length > 1 ? "s" : ""}:</p>
        <ul>
          ${alerts
            .map(
              (a: any) =>
                `<li><strong>${a.service}</strong> — ${a.message} (end date: ${a.endDate})</li>`
            )
            .join("")}
        </ul>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SubSync <onboarding@resend.dev>",
        to: ["bererhout.z@gmail.com"],
        subject: `SubSync reminders (${alerts.length})`,
        html,
      }),
    });

    const emailText = await emailRes.text();
    console.log("Resend status:", emailRes.status);
    console.log("Resend response:", emailText);

    if (!emailRes.ok) {
      throw new Error(`Resend failed: ${emailText}`);
    }

    return new Response(
      JSON.stringify({ ok: true, sent: alerts.length }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Function error:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});