Comments = (function () {
  var timeTick = new Tracker.Dependency(),
    collection = new Mongo.Collection('comments'),
    CommentSchema;

  // Reactive moment changes
  Meteor.setInterval(function () {
    timeTick.changed();
  }, 1000);

  function fromNowReactive(mmt) {
    timeTick.depend();
    return mmt.fromNow();
  }

  CommentSchema = new SimpleSchema({
    userId: {
      type: String
    },
    referenceId: {
      type: String
    },
    content: {
      type: String,
      max: 200
    },
    replies: {
      // TODO: does this self reference work?, otherwise do a base schema object and _.extend it (replies don't need referenceId)
      type: [CommentSchema],
      optional: true
    },
    likes: {
      type: [String],
      autoValue: function() {
        if (this.isInsert) {
          return [];
        }
      }
    },
    createdAt: {
      type: Date,
      autoValue: function() {
        if (this.isInsert) {
          return new Date;
        } else if (this.isUpsert) {
          return {$setOnInsert: new Date};
        } else {
          this.unset();
        }
      }
    },
    lastUpdatedAt: {
      type: Date,
      autoValue: function() {
        if (this.isUpdate) {
          return new Date();
        }
      },
      denyInsert: true,
      optional: true
    }
  });

  collection.attachSchema(CommentSchema);

  // Is handled with Meteor.methods
  collection.allow({
    insert: function () { return false; },
    update: function () { return false; },
    remove: function () { return false; }
  });

  collection.helpers({
    likesCount: function () {
      if (this.likes && this.likes.length) {
        return this.likes.length;
      }

      return 0;
    },
    user: function () {
      var user = Meteor.users.findOne(this.userId);

      if (user) {
        return {
          email: user.emails[0].address
        };
      }
    },
    createdAgo: function () {
      return fromNowReactive(moment(this.createdAt));
    }
  });

  Meteor.methods({
    'comments/add': function (referenceId, content) {
      check(referenceId, String);
      check(content, String);

      collection.insert({ referenceId: referenceId, content: content, userId: this.userId, createdAt: (new Date()), likes: [] });
    },
    'comments/edit': function (documentId, newContent) {
      check(documentId, String);
      check(newContent, String);

      collection.update(
        { _id: documentId, userId: this.userId },
        { $set: { content: newContent, likes: [] } }
      );
    },
    'comments/remove': function (documentId) {
      check(documentId, String);
      collection.remove({ _id: documentId, userId: this.userId });
    },
    'comments/like': function (documentId) {
      check (documentId, String);
      check(this.userId, String);

      if (collection.findOne({ _id: documentId, likes: { $in: [this.userId] } })) {
        collection.update({ _id: documentId }, { $pull: { likes: this.userId } })
      } else {
        collection.update({ _id: documentId }, { $push: { likes: this.userId } })
      }
    },
    'comments/count': function (referenceId) {
      check(referenceId, String);
      return collection.find({ referenceId: referenceId }).count();
    }
  });


  if (Meteor.isServer) {
    Meteor.publishComposite('comments/reference', function (id, limit) {
      check(id, String);
      check(limit, Number);

      return {
        find: function () {
          return collection.find({ referenceId: id }, { limit: limit, sort: { createdAt: -1 } });
        },
        children: [{
          find: function (comment) {
            return Meteor.users.find({ _id: comment.userId }, { limit: 1, fields: { profile: 1, emails: 1 } });
          }
        }]
      };
    })
  }

  return {
    get: function (id) {
      return collection.find({ referenceId: id }, { sort: { createdAt: -1 } });
    },
    getAll: function () {
      return collection.find({}, { sort: { createdAt: -1 } });
    },
    add: function (referenceId, content) {
      Meteor.call('comments/add', referenceId, content);
    },
    edit: function (documentId, newContent) {
      Meteor.call('comments/edit', documentId, newContent);
    },
    remove: function (documentId) {
      Meteor.call('comments/remove', documentId);
    },
    like: function (documentId) {
      Meteor.call('comments/like', documentId);
    },
    session: {
      set: function (key, val) {
        return Session.set('commentsUi_' + key, val);
      },
      get: function (key) {
        return Session.get('commentsUi_' + key);
      },
      equals: function (key, val) {
        return Session.equals('commentsUi_' + key, val);
      }
    },
    _collection: collection
  };
})();
