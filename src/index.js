require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();

// Slack slash commands come in as x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// Onboarded webhooks come in as JSON
app.use(express.json());

// ------------------------------------
// Health Check
// ------------------------------------
app.get("/health", (req, res) => {
  res.send("OK");
});

// ------------------------------------
// Slack Slash Command Handler
// Usage: /marriage-name-change <email> <new_last_name>
// ------------------------------------
app.post("/slack/commands", async (req, res) => {
  try {
    const { text, user_name } = req.body;
    console.log("Slash command from:", user_name, "text:", text);

    // Parse args
    const [email, newLastName] = (text || "").trim().split(/\s+/);

    if (!email || !newLastName) {
      return res.json({
        response_type: "ephemeral",
        text: "Usage: /marriage-name-change <email> <new_last_name>",
      });
    }

    const onboardedBaseUrl = process.env.ONBOARDED_BASE_URL;
    const apiKey = process.env.ONBOARDED_API_KEY;
    const nameChangeFormId = process.env.NAME_CHANGE_FORM_ID;
    const employerId = process.env.NAME_CHANGE_EMPLOYER_ID;

    if (!onboardedBaseUrl || !apiKey || !nameChangeFormId || !employerId) {
      console.error("Missing env vars", {
        onboardedBaseUrl,
        hasApiKey: !!apiKey,
        nameChangeFormId,
        employerId,
      });
      return res.json({
        response_type: "ephemeral",
        text: "Server missing configuration. Please contact the admin.",
      });
    }

    const client = axios.create({
      baseURL: onboardedBaseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    // ------------------------------------
    // 1) Look up employee by email
    // ------------------------------------
    let employeeId;

    try {
      const empResp = await client.get("/employees", {
        params: { email },
      });

      const employees = empResp.data?.data || empResp.data || [];
      const matches = employees.filter(
        (e) => e.email && e.email.toLowerCase() === email.toLowerCase()
      );

      if (matches.length === 0) {
        return res.json({
          response_type: "ephemeral",
          text: `❌ No employee found with email *${email}*.`,
        });
      }

      if (matches.length > 1) {
        return res.json({
          response_type: "ephemeral",
          text: `⚠️ Multiple employees found with email *${email}*. Please resolve duplicates in Onboarded or use the specific employee ID.`,
        });
      }

      employeeId = matches[0].id;
    } catch (lookupErr) {
      const details = lookupErr?.response?.data || lookupErr.message;
      console.error("Error looking up employee by email:", details);
      return res.json({
        response_type: "ephemeral",
        text: `❌ Failed to look up employee by email: \`${JSON.stringify(
          details
        )}\``,
      });
    }

    // ------------------------------------
    // 2) Update last name
    // ------------------------------------
    await client.patch(`/employees/${employeeId}`, {
      last_name: newLastName,
    });

    // ------------------------------------
    // 3) Create the Marriage Name Change task
    // ------------------------------------
    await client.post("/tasks?allow_duplicate=true", {
      employee_id: employeeId,
      form_id: nameChangeFormId, 
      employer_id: process.env.NAME_CHANGE_EMPLOYER_ID 
    });

    // ------------------------------------
    // 4) Respond to Slack
    // ------------------------------------
    return res.json({
      response_type: "ephemeral",
      text: `:pushpin: Updated last name to *${newLastName}* and created a 'Marriage Name Change' task for *${email}* (employee: ${employeeId}).`,
    });
  } catch (err) {
    console.error(
      "Error handling slash command:",
      err?.response?.data || err.message
    );

    return res.json({
      response_type: "ephemeral",
      text: "❌ Something went wrong. Please try again.",
    });
  }
});

// ------------------------------------
// Onboarded Webhook Receiver
// (Handles task.updated events)
// ------------------------------------
app.post(
  "/onboarded/webhook",
  bodyParser.json({ type: "*/*" }), // be generous about content-type
  async (req, res) => {
    const event = req.body;
    console.log("📩 Onboarded webhook headers:", req.headers);
    console.log("📩 Onboarded webhook body:", event);

    const task = event.data;

    try {
      // Only care about completed Marriage Name Change tasks
      if (
        event.type === "task.updated" &&
        task &&
        task.form_id === process.env.NAME_CHANGE_FORM_ID &&
        task.status === "completed"
      ) {
        const slackWebhookUrl = process.env.SLACK_COMPLETIONS_WEBHOOK_URL;

        if (!slackWebhookUrl) {
          console.error("SLACK_COMPLETIONS_WEBHOOK_URL not set");
        } else {
          // Look up employee to get email (and optionally name)
          let employeeEmail = task.employee_id;
          let employeeName = null;

          try {
            const onboardedBaseUrl = process.env.ONBOARDED_BASE_URL;
            const apiKey = process.env.ONBOARDED_API_KEY;

            const client = axios.create({
              baseURL: onboardedBaseUrl,
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            });

            const empResp = await client.get(`/employees/${task.employee_id}`);
            const employee = empResp.data;

            if (employee) {
              employeeEmail = employee.email || employeeEmail;
              if (employee.first_name || employee.last_name) {
                employeeName = `${employee.first_name || ""} ${
                  employee.last_name || ""
                }`.trim();
              }
            }
          } catch (lookupErr) {
            console.error(
              "Error looking up employee for webhook:",
              lookupErr?.response?.data || lookupErr.message
            );
          }

          // Build a human-readable Slack message
          const who =
            employeeName && employeeEmail
              ? `${employeeName} <${employeeEmail}>`
              : employeeEmail;

          const text = `:white_check_mark: *Marriage Name Change* form completed for ${who} (employee: ${task.employee_id}).`;

          await axios.post(slackWebhookUrl, { text });

          console.log("Posted completion message to Slack");
        }
      }

      // Always acknowledge so Onboarded stops retrying
      res.status(200).send("ok");
    } catch (err) {
      console.error(
        "Error handling Onboarded webhook:",
        err?.response?.data || err.message
      );
      res.status(200).send("ok");
    }
  }
);

// ------------------------------------
// Start Server
// ------------------------------------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
