# Google
      
Connect various Google services to your Roam graph!

## Setup

To use any of the Google services included in this extension, you will first need to connect your Google account to Roam. To do so, go to the your Roam Depot settings for this extension and click on the Login with Google button. Only specify the permissions necessary for the features you plan to use with this extension - for example, if you don't plan to use Google Drive, do not enable the Google Drive related permissions. Once you've completed login, your account should appear in the Roam Depot settings.

## Google Calendar

In any page, activate the Roam Command Palette by hitting CTRL+P on windows or CMD+P on Mac, then click the `Import Google Calendar` command. The extension will fill the page with the events you have for that day. It will be displayed in the timezone of your browser. It will use either the page's title if it's a daily note, or the current date if it's not, as the date to import.

### Creating Events

You can create google calendar event right from Roam! To create an event, focus on a block and then activate the Roam native command palette, and click `Create Google Calendar Event`. The dialog will prefill with the data that is in the block and its children. Use native Roam Attributes with a double colon (`::`) to specify a field and its value as children of the focused block.Click create to generate the event on your primary Google Calendar. Once successfully created, the link to the event will be added to the block. This is an example of a block and the values that will prefill the modal:

![](https://firebasestorage.googleapis.com/v0/b/firescript-577a2.appspot.com/o/imgs%2Fapp%2Froamjs%2FQZXgJzHZB6.png?alt=media&token=b17c99f1-5b4d-4d8e-82d3-2c27dfc50d09)

![](https://firebasestorage.googleapis.com/v0/b/firescript-577a2.appspot.com/o/imgs%2Fapp%2Froamjs%2FIseiuxYOTq.png?alt=media&token=49c2ca42-8bb7-49da-95d5-dad0aaad9cc5)

### Updating Events

You can update existing events on Google Calendar from Roam.

On any block that has a Google Calendar link, an edit pencil will appear on the right end of the block. Clicking the pencil will prefill the dialog with the event's __existing__ data from Google Calendar. Change the values from the dialog and hit update. Upon successfully updating, the block's contents with the link will update to reflect the new values of the Google Calendar event! You could also edit the event by selecting "Edit Google Calendar Event" from the command palette while focused on the block.

### SmartBlocks

This extension integrates with [SmartBlocks](https://roamjs.com/extensions/smartblocks)! 

If you have both this extension and SmartBlocks installed, there is a `<%GOOGLECALENDAR%>` command available. The command will automatically run the import google calendar logic and paste the events in blocks before continuing with the rest of the workflow.

### Customization

All of these options are configurable from the Roam Depot page. If you used this extension when it used to hosted from RoamJS directly, there is a `Migrate Settings To Roam Depot: google-calendar` command available to migrate your old settings to the new version.
- `Linked Calendars` specifies which calendars you would like Roam to read before importing. If you specify more than one, it will read from all of those calendars. You must use the calendar ID provided by Google which you could find in the calendar settings. This will usually be your Gmail address, such as `dvargas92495@gmail.com`. If you are logged in with multiple accounts on the `roam/js/google` page, you could specify which one each calendar is mapped to.
- `Calendar Event Format` specifies the text to add for each calendar event. It is a multi-block format so you could specify child blocks as part of the format. Could use the following placeholders to be replaced with the event's data:
    - `{summary}` - the name of the event
    - `{link}` - the link for the event
    - `{hangout}` - the hangout link for the event
    - `{confLink}` - a conference link for the event (labeled 'Meet' or 'Zoom' as appropriate)
    - `{location}` - the location for the event
    - `{start}` - the start time of the event. Add a colon and format to customize the start time format. For example, `{start:hh:mm}` will resolve to `12:00`. See the [date-fns library](https://date-fns.org/v2.22.1/docs/format) for more details on time formats.
    - `{end}` - the end time of the event. Add a colon and format to customize the end time format. For example, `{end:hh:mmaaaaa}` will resolve to `12:00p`. See the [date-fns library](https://date-fns.org/v2.22.1/docs/format) for more details on time formats.
    - `{attendees}` - the attendees of the event, comma-delimited. Could optionally include a format after a colon. For example, `{attendees:[[NAME]]}` will output each attendee as a page reference. The placeholder `NAME` will be replaced by the attendee's display name or the email if there's no display name.
        - Display names are only available for gmail.com accounts, not for Gsuite/Workspaces accounts.
    - `{calendar}` - the calendar id of the event
    - `{duration}` - the duration of the event in minutes
    - `{todo}` - A `{{[[TODO]]}}` checkbox
- `Calendar Event Filter` is an optional regular expression you could use to filter for events based on the summary or description.
- `Skip Free Events` filters out the events from your calendar that you've set to 'Free'

### DEMO

<video src="https://roamjs.com/loom/47aded52527343929e6be51cbee85052.mp4" controls="controls"></video>

[View on Loom](https://www.loom.com/share/47aded52527343929e6be51cbee85052)

## Google Drive

To use this feature, ensure that the `Intercept Uploads to Drive` setting is enabled in your Roam Depot settings.

Anytime you upload a file to Roam, the Google extension will intercept the upload and send it to your Google Drive account instead. It will insert a new google drive component after a successful upload.

The Google Drive component is made of two parts: the preview and the open in Drive button. The preview will render the contents of the file inline within Roam. Currently, only images, videos, and pdfs are supported. The open in Drive button will be below the preview and will take you to the file in google drive on click.

## Configuration

By default, files are uploaded to the `RoamJS` folder in your drive. You could change the name of this folder using the `Upload Folder` field. Make sure it is a brand new folder name, as this extension does not have access to preexisting folders.

### DEMO

<video src="https://roamjs.com/loom/ce086b114ad6453194b5074c4d4f7c13.mp4" controls="controls"></video>

[View on Loom](https://www.loom.com/share/ce086b114ad6453194b5074c4d4f7c13)
